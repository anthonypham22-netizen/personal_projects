import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { db, one } from "@/lib/db";
import {
  AppError,
  getDeal,
  isManager,
  canAccess,
  membership,
  audit,
  limit,
} from "@/lib/service";
import { checkOrigin, failure } from "@/lib/http";
import { inTransaction } from "@/lib/transaction";
import {
  bestBuyerProjectForDeal,
  buyerOrganizationIdForUser,
  recordDealBuyerEvent,
} from "@/lib/buyer-funnel";
import {
  dealTeamUserIds,
  documentAudienceUserIds,
  notifyUsers,
} from "@/lib/notifications";
import { assertWatermarkablePdf } from "@/lib/document-watermarks";
import { privateFileStore } from "@/lib/private-file-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let storedKey: string | undefined;
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    await limit(`upload:${user.id}`, 20, 60);
    const length = Number(request.headers.get("content-length"));
    if (!length || length > 11 * 1024 * 1024)
      throw new AppError(
        "Upload requires a content length and must be under 10 MB.",
        413,
      );
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
      throw new AppError("Select a non-empty file up to 10 MB.");
    const deal = await getDeal(String(form.get("deal_id") || ""));
    const managing = await isManager(user, deal);
    const category = String(form.get("category") || "Other");
    if (
      ![
        "Financials",
        "Company overview",
        "NDA",
        "LOI",
        "Legal",
        "Other",
      ].includes(category)
    )
      throw new AppError("Invalid document category.");
    if (user.role !== "buyer" && !managing)
      throw new AppError(
        "Read-only deal-team members cannot upload documents.",
        403,
      );
    const member = await membership(deal.id, user.id);
    if (
      !managing &&
      !(await canAccess(user, deal)) &&
      !(category === "NDA" && member?.status === "nda_pending")
    )
      throw new AppError("Document access has not been approved.", 403);
    const ext = path.extname(file.name).toLowerCase();
    const mime: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".csv": "text/csv",
      ".txt": "text/plain",
    };
    if (!mime[ext])
      throw new AppError("Supported files: PDF, DOCX, XLSX, CSV, TXT.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (ext === ".pdf" && buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new AppError("The file is not a valid PDF.");
    if (
      [".docx", ".xlsx"].includes(ext) &&
      buffer.subarray(0, 2).toString() !== "PK"
    )
      throw new AppError("The file is not a valid Office document.");
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180);
    let audience = managing ? String(form.get("audience") || "team") : "buyer";
    let buyerId = managing ? String(form.get("buyer_id") || "") : user.id;
    if (!["team", "approved", "buyer"].includes(audience))
      throw new AppError("Invalid visibility.");
    if (category === "NDA" || category === "LOI") {
      audience = "buyer";
      if (!buyerId) throw new AppError("Choose the buyer for this agreement.");
    }
    if (audience === "buyer" && !(await membership(deal.id, buyerId)))
      throw new AppError("Choose an invited buyer for this document.");
    if (audience !== "buyer") buyerId = "";
    const watermarkEnabled = String(form.get("watermark_enabled")) === "true";
    if (watermarkEnabled) {
      if (!managing)
        throw new AppError(
          "Only the deal team can enable personalized watermarking.",
          403,
        );
      if (
        category !== "Company overview" ||
        mime[ext] !== "application/pdf" ||
        audience === "team"
      )
        throw new AppError(
          "Personalized watermarking is available for PDF company overviews shared with buyers.",
        );
      await assertWatermarkablePdf(buffer);
    }
    const version =
      ((
        await one<{ version: number }>(
          "SELECT MAX(version) version FROM documents WHERE deal_id=? AND name=? AND audience=? AND COALESCE(buyer_id,'')=?",
          deal.id,
          name,
          audience,
          buyerId,
        )
      )?.version || 0) + 1;
    const id = randomUUID(),
      key = randomUUID();
    const fileStore = privateFileStore();
    storedKey = key;
    await fileStore.write("uploads", key, buffer, { contentType: mime[ext] });
    const database = db();
    await inTransaction(database, async (transaction) => {
      await transaction
        .prepare(
          "INSERT INTO documents(id,deal_id,name,storage_key,mime,category,size,version,audience,buyer_id,uploaded_by,watermark_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          deal.id,
          name,
          key,
          mime[ext],
          category,
          file.size,
          version,
          audience,
          buyerId || null,
          user.id,
          watermarkEnabled ? 1 : 0,
        );
      const recipientIds: string[] =
        category === "NDA" && buyerId
          ? [buyerId]
          : category === "Company overview" && audience === "buyer" && buyerId
            ? [buyerId]
            : category === "Company overview" && audience === "approved"
              ? (
                  await transaction
                    .prepare(
                      "SELECT buyer_id FROM access WHERE deal_id=? AND status='approved'",
                    )
                    .all<{ buyer_id: string }>(deal.id)
                ).map(({ buyer_id }) => buyer_id)
              : [];
      const notificationUserIds = managing
        ? await documentAudienceUserIds(
            transaction,
            deal.id,
            audience as "team" | "approved" | "buyer",
            buyerId,
          )
        : await dealTeamUserIds(transaction, deal.id);
      const organizationIds = new Set(
        (
          await Promise.all(
            recipientIds.map((recipientId) =>
              buyerOrganizationIdForUser(transaction, recipientId),
            ),
          )
        ).filter((organizationId): organizationId is string =>
          Boolean(organizationId),
        ),
      );
      for (const organizationId of organizationIds)
        await recordDealBuyerEvent(transaction, {
          dealId: deal.id,
          buyerOrganizationId: organizationId,
          buyerProjectId:
            (
              await bestBuyerProjectForDeal(
                transaction,
                deal.id,
                organizationId,
              )
            )?.buyer_project_id ?? null,
          eventType: category === "NDA" ? "nda_uploaded" : "cim_shared",
          sourceKey: `document:${id}`,
          createdByUserId: user.id,
        });
      await notifyUsers(transaction, {
        userIds: notificationUserIds,
        type: "document_shared",
        title: "Document shared",
        body: `${user.name} shared ${name} in ${deal.title}.`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `document:${id}:shared`,
      });
    });
    await audit(user, deal.id, `Uploaded ${category.toLowerCase()} document`);
    storedKey = undefined;
    return NextResponse.json({
      id,
      message: watermarkEnabled
        ? "Document uploaded. Each buyer download will receive a personalized watermarked PDF."
        : "Document uploaded. Agreement uploads require separate review; they are not automatically signed.",
    });
  } catch (e) {
    if (storedKey)
      await privateFileStore().delete("uploads", storedKey).catch(() => {});
    return failure(e);
  }
}
