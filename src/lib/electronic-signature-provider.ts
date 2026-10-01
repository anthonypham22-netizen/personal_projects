import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  ElectronicSignatureCapability,
  ElectronicSignatureStatus,
} from "./types";
import { isDemoAllowed } from "./app-environment";

export type CreateNdaEnvelopeInput = {
  localEnvelopeId: string;
  dealTitle: string;
  buyerName: string;
  buyerEmail: string;
  requestedByName: string;
};

export type VerifiedElectronicSignatureEvent = {
  provider: string;
  providerEventId: string;
  providerEnvelopeId: string;
  status: Exclude<ElectronicSignatureStatus, "creating" | "sent">;
  occurredAt: string | null;
  payloadDigest?: string;
  executedDocument?: {
    name: string;
    mime: "application/pdf";
    bytes: Uint8Array;
  };
};

export type ElectronicSignatureProvider = {
  id: string;
  displayName: string;
  createNdaEnvelope(
    input: CreateNdaEnvelopeInput,
  ): Promise<{ providerEnvelopeId: string }>;
  verifyWebhook(input: {
    body: Uint8Array;
    headers: Headers;
  }): Promise<VerifiedElectronicSignatureEvent>;
};

const developmentProviderId = "development";
const defaultDevelopmentSecret = "succera-local-development-only";

const safeEqual = (left: string, right: string) => {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const developmentProvider = (): ElectronicSignatureProvider => ({
  id: developmentProviderId,
  displayName: "Development signature provider",
  async createNdaEnvelope({ localEnvelopeId }) {
    return { providerEnvelopeId: `dev-${localEnvelopeId}-${randomUUID()}` };
  },
  async verifyWebhook({ body, headers }) {
    const secret =
      process.env.ELECTRONIC_SIGNATURE_WEBHOOK_SECRET ||
      defaultDevelopmentSecret;
    const supplied = headers.get("x-succera-signature") || "";
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (!supplied || !safeEqual(supplied, expected))
      throw new Error("Webhook signature verification failed.");
    const raw = JSON.parse(Buffer.from(body).toString("utf8")) as Record<
      string,
      unknown
    >;
    const status = String(raw.status || "") as ElectronicSignatureStatus;
    if (
      !["buyer_signed", "completed", "declined", "voided", "failed"].includes(
        status,
      )
    )
      throw new Error("Unsupported electronic signature event.");
    const providerEventId = String(raw.event_id || "").slice(0, 200);
    const providerEnvelopeId = String(raw.envelope_id || "").slice(0, 200);
    if (!providerEventId || !providerEnvelopeId)
      throw new Error("Electronic signature event identifiers are required.");
    let executedDocument: VerifiedElectronicSignatureEvent["executedDocument"];
    if (status === "completed") {
      const document = raw.document as Record<string, unknown> | undefined;
      const bytes = Buffer.from(
        String(document?.content_base64 || ""),
        "base64",
      );
      if (
        document?.mime !== "application/pdf" ||
        !bytes.length ||
        bytes.length > 10 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        throw new Error("A valid executed PDF is required for completion.");
      executedDocument = {
        name: String(document.name || "Executed NDA.pdf"),
        mime: "application/pdf",
        bytes,
      };
    }
    return {
      provider: developmentProviderId,
      providerEventId,
      providerEnvelopeId,
      status: status as VerifiedElectronicSignatureEvent["status"],
      occurredAt: typeof raw.occurred_at === "string" ? raw.occurred_at : null,
      executedDocument,
    };
  },
});

export function configuredElectronicSignatureProvider():
  ElectronicSignatureProvider | undefined {
  const selected = process.env.ELECTRONIC_SIGNATURE_PROVIDER?.trim();
  if (!isDemoAllowed()) return undefined;
  if (selected === developmentProviderId || !selected)
    return developmentProvider();
  return undefined;
}

export function electronicSignatureProviderForWebhook(providerId: string) {
  const provider = configuredElectronicSignatureProvider();
  return provider?.id === providerId ? provider : undefined;
}

export function electronicSignatureCapability(): ElectronicSignatureCapability {
  const provider = configuredElectronicSignatureProvider();
  return {
    available: Boolean(provider),
    provider_name: provider?.displayName ?? null,
  };
}
