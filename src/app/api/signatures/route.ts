import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { configuredElectronicSignatureProvider } from "@/lib/electronic-signature-provider";
import { requestElectronicNda } from "@/lib/electronic-signatures";
import { checkOrigin, failure, jsonBody } from "@/lib/http";
import { AppError } from "@/lib/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    const body = (await jsonBody(request)) as {
      action?: unknown;
      data?: { deal_id?: unknown; buyer_id?: unknown };
    };
    if (body.action !== "requestElectronicNda")
      throw new AppError("Unsupported electronic signature action.");
    const provider = configuredElectronicSignatureProvider();
    if (!provider)
      throw new AppError(
        "Electronic signatures are not configured. Use external NDA upload.",
        503,
      );
    return NextResponse.json(
      await requestElectronicNda(user, body.data || {}, provider),
    );
  } catch (error) {
    return failure(error);
  }
}
