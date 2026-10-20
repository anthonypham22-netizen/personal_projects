import { NextResponse } from "next/server";
import { electronicSignatureProviderForWebhook } from "@/lib/electronic-signature-provider";
import { processElectronicSignatureEvent } from "@/lib/electronic-signatures";
import { failure } from "@/lib/http";
import { AppError } from "@/lib/service";
import { pilotCapabilities } from "@/lib/pilot-capabilities";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    if (!pilotCapabilities.electronicSignatures)
      throw new AppError("Electronic signatures are unavailable.", 404);
    const { provider: providerId } = await context.params;
    const provider = electronicSignatureProviderForWebhook(providerId);
    if (!provider) throw new AppError("Signing provider not configured.", 404);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 14 * 1024 * 1024)
      throw new AppError("Webhook payload is too large.", 413);
    const body = new Uint8Array(await request.arrayBuffer());
    if (!body.length || body.length > 14 * 1024 * 1024)
      throw new AppError("Webhook payload is invalid.", 413);
    let event;
    try {
      event = await provider.verifyWebhook({ body, headers: request.headers });
    } catch {
      throw new AppError("Webhook verification failed.", 401);
    }
    const result = await processElectronicSignatureEvent(event);
    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
