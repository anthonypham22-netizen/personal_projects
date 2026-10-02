import { createHash, randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db";
import {
  bestBuyerProjectForDeal,
  buyerOrganizationIdForUser,
  recordDealBuyerEvent,
} from "./buyer-funnel";
import { db } from "./db";
import type {
  ElectronicSignatureProvider,
  VerifiedElectronicSignatureEvent,
} from "./electronic-signature-provider";
import { recalculateBuyerOrganizationDealMatches } from "./match-store";
import { notifyUsers } from "./notifications";
import { recordInitialTransactionAttribution } from "./transaction-attribution";
import {
  AppError,
  getDeal,
  limit,
  membership,
  requireManager,
} from "./service";
import { inTransaction } from "./transaction";
import type { Access, ElectronicSignatureStatus, User } from "./types";
import { buyerIdentityIsApproved } from "./buyer-identity-verification";
import { privateFileStore } from "./private-file-store";

type ElectronicEnvelopeRow = {
  id: string;
  access_id: string;
  deal_id: string;
  buyer_id: string;
  provider: string;
  provider_name: string;
  provider_envelope_id: string | null;
  status: ElectronicSignatureStatus;
  requested_by_user_id: string;
};

const safeId = (value: unknown, label: string) => {
  const id = String(value || "").trim();
  if (!id || id.length > 100) throw new AppError(`${label} is required.`);
  return id;
};

const payloadDigest = (event: VerifiedElectronicSignatureEvent) =>
  event.payloadDigest ||
  createHash("sha256")
    .update(
      JSON.stringify({
        provider: event.provider,
        event: event.providerEventId,
        envelope: event.providerEnvelopeId,
        status: event.status,
        occurredAt: event.occurredAt,
      }),
    )
    .digest("hex");

export async function requestElectronicNda(
  user: User,
  input: { deal_id?: unknown; buyer_id?: unknown },
  provider: ElectronicSignatureProvider,
) {
  const dealId = safeId(input.deal_id, "Deal");
  const buyerId = safeId(input.buyer_id, "Buyer");
  const deal = await getDeal(dealId);
  await requireManager(user, deal);
  await limit(`electronic-nda:${user.id}`, 20, 60);
  const database = db();
  const member = await membership(deal.id, buyerId);
  if (!member) throw new AppError("Buyer access request not found.", 404);
  if (member.status === "approved")
    throw new AppError("This buyer already has confidential access.");
  if (!["requested", "nda_pending"].includes(member.status))
    throw new AppError("Reopen this buyer before requesting an NDA.");
  const buyer = (await database
    .prepare("SELECT name,email FROM users WHERE id=? AND role='buyer'")
    .get(buyerId)) as { name: string; email: string } | undefined;
  if (!buyer) throw new AppError("Buyer account not found.", 404);

  const localEnvelopeId = randomUUID();
  await inTransaction(database, async (transaction) => {
    const active = await transaction
      .prepare(
        `SELECT id FROM electronic_signature_envelopes
         WHERE access_id=? AND status IN ('creating','sent','buyer_signed')
         LIMIT 1`,
      )
      .get(member.id);
    if (active)
      throw new AppError("An electronic NDA request is already active.");
    await transaction
      .prepare(
        `INSERT INTO electronic_signature_envelopes(
          id,access_id,deal_id,buyer_id,provider,provider_name,status,
          requested_by_user_id
        ) VALUES(?,?,?,?,?,?,'creating',?)`,
      )
      .run(
        localEnvelopeId,
        member.id,
        deal.id,
        buyerId,
        provider.id,
        provider.displayName,
        user.id,
      );
    await transaction
      .prepare(
        `UPDATE access SET status='nda_pending',nda_status='requested',
           nda_document_id=NULL,nda_method='electronic_signature',
           electronic_signature_envelope_id=? WHERE id=?`,
      )
      .run(localEnvelopeId, member.id);
  });

  let created: { providerEnvelopeId: string };
  try {
    created = await provider.createNdaEnvelope({
      localEnvelopeId,
      dealTitle: deal.title,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      requestedByName: user.name,
    });
  } catch {
    await inTransaction(database, async (transaction) => {
      await transaction
        .prepare(
          `UPDATE electronic_signature_envelopes
           SET status='failed',failure_reason='Provider request failed',updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND status='creating'`,
        )
        .run(localEnvelopeId);
    });
    throw new AppError(
      "The signing provider could not create the NDA request. Use external upload or try again.",
      502,
    );
  }
  const providerEnvelopeId = created.providerEnvelopeId.trim();
  if (!providerEnvelopeId || providerEnvelopeId.length > 200) {
    await database
      .prepare(
        `UPDATE electronic_signature_envelopes
         SET status='failed',failure_reason='Provider response was invalid',
           updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'`,
      )
      .run(localEnvelopeId);
    throw new AppError(
      "The signing provider returned an invalid response. Use external upload.",
      502,
    );
  }
  const buyerOrganizationId = await buyerOrganizationIdForUser(
    database,
    buyerId,
  );
  await inTransaction(database, async (transaction) => {
    const updated = await transaction
      .prepare(
        `UPDATE electronic_signature_envelopes
         SET provider_envelope_id=?,status='sent',updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND status='creating'`,
      )
      .run(providerEnvelopeId, localEnvelopeId);
    if (!updated.changes)
      throw new AppError(
        "The electronic NDA request is no longer active.",
        409,
      );
    if (buyerOrganizationId) {
      const project = await bestBuyerProjectForDeal(
        transaction,
        deal.id,
        buyerOrganizationId,
      );
      await recordDealBuyerEvent(transaction, {
        dealId: deal.id,
        buyerOrganizationId,
        buyerProjectId: project?.buyer_project_id ?? null,
        eventType: "nda_requested",
        sourceKey: `electronic-envelope:${localEnvelopeId}:requested`,
        createdByUserId: user.id,
      });
      await recordInitialTransactionAttribution(transaction, {
        dealId: deal.id,
        buyerOrganizationId,
        source: "seller_invitation",
        createdByUserId: user.id,
      });
    }
    await notifyUsers(transaction, {
      userIds: [buyerId],
      type: "nda_requested",
      title: "Electronic NDA requested",
      body: `The deal team sent an NDA for ${deal.title} through ${provider.displayName}.`,
      href: `/app/deals/${deal.id}`,
      dealId: deal.id,
      actorUserId: user.id,
      sourceKey: `electronic-envelope:${localEnvelopeId}:sent`,
    });
    await transaction
      .prepare(
        "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",
      )
      .run(
        randomUUID(),
        deal.id,
        user.id,
        `Sent electronic NDA to ${buyer.name}`,
      );
  });
  return {
    id: localEnvelopeId,
    message: `Electronic NDA sent through ${provider.displayName}.`,
  };
}

const insertEvent = async (
  database: DatabaseClient,
  envelopeId: string,
  event: VerifiedElectronicSignatureEvent,
) => {
  const result = await database
    .prepare(
      `INSERT OR IGNORE INTO electronic_signature_events(
        id,envelope_id,provider,provider_event_id,status,payload_digest,occurred_at
      ) VALUES(?,?,?,?,?,?,?)`,
    )
    .run(
      randomUUID(),
      envelopeId,
      event.provider,
      event.providerEventId,
      event.status,
      payloadDigest(event),
      event.occurredAt,
    );
  return result.changes > 0;
};

export async function processElectronicSignatureEvent(
  event: VerifiedElectronicSignatureEvent,
  database: DatabaseClient = db(),
) {
  const envelope = (await database
    .prepare(
      `SELECT id,access_id,deal_id,buyer_id,provider,provider_name,
         provider_envelope_id,status,requested_by_user_id
       FROM electronic_signature_envelopes
       WHERE provider=? AND provider_envelope_id=?`,
    )
    .get(event.provider, event.providerEnvelopeId)) as
    ElectronicEnvelopeRow | undefined;
  if (!envelope) throw new AppError("Electronic NDA envelope not found.", 404);
  if (event.status !== "completed") {
    const accepted = await inTransaction(database, async (transaction) => {
      if (!(await insertEvent(transaction, envelope.id, event))) return false;
      if (event.status === "buyer_signed") {
        await transaction
          .prepare(
            `UPDATE electronic_signature_envelopes
             SET status='buyer_signed',buyer_signed_at=COALESCE(buyer_signed_at,?),
               updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND status IN ('creating','sent','buyer_signed')`,
          )
          .run(event.occurredAt ?? new Date().toISOString(), envelope.id);
      } else {
        await transaction
          .prepare(
            `UPDATE electronic_signature_envelopes
             SET status=?,failure_reason=?,updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND status IN ('creating','sent','buyer_signed')`,
          )
          .run(
            event.status,
            event.status === "failed" ? "Provider reported a failure" : null,
            envelope.id,
          );
      }
      return true;
    });
    return { accepted, granted: false };
  }

  const document = event.executedDocument;
  const bytes = document ? Buffer.from(document.bytes) : Buffer.alloc(0);
  if (
    !document ||
    document.mime !== "application/pdf" ||
    !bytes.length ||
    bytes.length > 10 * 1024 * 1024 ||
    bytes.subarray(0, 5).toString() !== "%PDF-"
  )
    throw new AppError("The provider completion did not include a valid PDF.");
  const name =
    document.name
      .replace(/[\x00-\x1f\x7f/\\]/g, "_")
      .trim()
      .slice(0, 180) || "Executed NDA.pdf";
  const documentId = randomUUID();
  const storageKey = randomUUID();
  const fileStore = privateFileStore();
  await fileStore.write("uploads", storageKey, bytes, {
    contentType: document.mime,
  });
  let retained = false;
  try {
    const result = await inTransaction(database, async (transaction) => {
      if (!(await insertEvent(transaction, envelope.id, event)))
        return { accepted: false, granted: false };
      const current = (await transaction
        .prepare(
          `SELECT a.status,a.nda_method,a.electronic_signature_envelope_id,
             e.status envelope_status
           FROM access a JOIN electronic_signature_envelopes e ON e.id=?
           WHERE a.id=?`,
        )
        .get(envelope.id, envelope.access_id)) as
        | {
            status: string;
            nda_method: string;
            electronic_signature_envelope_id: string | null;
            envelope_status: ElectronicSignatureStatus;
          }
        | undefined;
      if (
        !current ||
        current.nda_method !== "electronic_signature" ||
        current.electronic_signature_envelope_id !== envelope.id ||
        !["creating", "sent", "buyer_signed"].includes(current.envelope_status)
      )
        return { accepted: true, granted: false };
      const version =
        (
          (await transaction
            .prepare(
              `SELECT MAX(version) version FROM documents
               WHERE deal_id=? AND name=? AND audience='buyer' AND buyer_id=?`,
            )
            .get(envelope.deal_id, name, envelope.buyer_id)) as
            { version: number | null } | undefined
        )?.version ?? 0;
      await transaction
        .prepare(
          `INSERT INTO documents(
            id,deal_id,name,storage_key,mime,category,size,version,audience,
            buyer_id,uploaded_by
          ) VALUES(?,?,?,?,?,'NDA',?,?,'buyer',?,?)`,
        )
        .run(
          documentId,
          envelope.deal_id,
          name,
          storageKey,
          document.mime,
          bytes.length,
          version + 1,
          envelope.buyer_id,
          envelope.requested_by_user_id,
        );
      await transaction
        .prepare(
          `UPDATE electronic_signature_envelopes
           SET status='completed',executed_document_id=?,completed_at=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        )
        .run(
          documentId,
          event.occurredAt ?? new Date().toISOString(),
          envelope.id,
        );
      const buyerApproved = await buyerIdentityIsApproved(
        envelope.buyer_id,
        transaction,
      );
      await transaction
        .prepare(
          `UPDATE access SET status=CASE WHEN ?=1 THEN 'approved' ELSE status END,
             nda_status='verified',
             nda_document_id=? WHERE id=?`,
        )
        .run(buyerApproved ? 1 : 0, documentId, envelope.access_id);
      const buyerOrganizationId = await buyerOrganizationIdForUser(
        transaction,
        envelope.buyer_id,
      );
      if (buyerOrganizationId) {
        const project = await bestBuyerProjectForDeal(
          transaction,
          envelope.deal_id,
          buyerOrganizationId,
        );
        const buyerProjectId = project?.buyer_project_id ?? null;
        await recordDealBuyerEvent(transaction, {
          dealId: envelope.deal_id,
          buyerOrganizationId,
          buyerProjectId,
          eventType: "nda_uploaded",
          sourceKey: `document:${documentId}`,
          createdByUserId: envelope.requested_by_user_id,
        });
        if (buyerApproved) {
          await recordDealBuyerEvent(transaction, {
            dealId: envelope.deal_id,
            buyerOrganizationId,
            buyerProjectId,
            eventType: "nda_approved",
            sourceKey: `electronic-envelope:${envelope.id}:approved`,
            createdByUserId: envelope.requested_by_user_id,
          });
          const cims = (await transaction
            .prepare(
              `SELECT id,uploaded_by FROM documents
               WHERE deal_id=? AND category='Company overview' AND audience='approved'`,
            )
            .all(envelope.deal_id)) as { id: string; uploaded_by: string }[];
          for (const cim of cims)
            await recordDealBuyerEvent(transaction, {
              dealId: envelope.deal_id,
              buyerOrganizationId,
              buyerProjectId,
              eventType: "cim_shared",
              sourceKey: `document:${cim.id}`,
              createdByUserId: cim.uploaded_by,
            });
        }
        await recalculateBuyerOrganizationDealMatches(
          transaction,
          buyerOrganizationId,
          envelope.deal_id,
        );
      }
      const deal = (await transaction
        .prepare("SELECT title FROM deals WHERE id=?")
        .get(envelope.deal_id)) as { title: string };
      await notifyUsers(transaction, {
        userIds: [envelope.buyer_id],
        type: "nda_approved",
        title: "NDA completed",
        body: buyerApproved
          ? `Your confidential access to ${deal.title} is now available.`
          : `Your NDA for ${deal.title} is complete. Confidential access will remain locked until buyer verification is approved.`,
        href: `/app/deals/${envelope.deal_id}`,
        dealId: envelope.deal_id,
        sourceKey: `electronic-envelope:${envelope.id}:completed`,
      });
      await transaction
        .prepare(
          "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",
        )
        .run(
          randomUUID(),
          envelope.deal_id,
          envelope.requested_by_user_id,
          buyerApproved
            ? "Electronic NDA completed and confidential access granted"
            : "Electronic NDA completed; access held for buyer verification",
        );
      return { accepted: true, granted: buyerApproved, retained: true };
    });
    retained = Boolean("retained" in result && result.retained);
    return { accepted: result.accepted, granted: result.granted };
  } finally {
    if (!retained)
      await fileStore.delete("uploads", storageKey).catch(() => {});
  }
}
