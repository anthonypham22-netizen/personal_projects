import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/auth";
import {
  approveBuyerVerification,
  buyerVerificationForAdmin,
  rejectBuyerVerification,
  requestBuyerVerificationInfo,
} from "@/lib/buyer-identity-verification";
import { AppError } from "@/lib/service";
import { checkOrigin, failure, jsonBody } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const admin = await requirePlatformAdminApi();
    const { id } = await params;
    const existing = await buyerVerificationForAdmin(admin, id);
    if (!existing) throw new AppError("Buyer verification not found.", 404);
    const parsed = z
      .object({
        action: z.enum(["approve", "request_more_information", "reject"]),
        notes: z.string().trim().max(5000),
      })
      .safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new AppError("Choose a valid decision and review note.");
    if (parsed.data.action !== "approve" && parsed.data.notes.length < 10)
      throw new AppError(
        "Explain what the buyer needs to change (at least 10 characters).",
      );
    if (existing.user_id === admin.id)
      throw new AppError("You cannot review your own application.", 403);
    const changed =
      parsed.data.action === "approve"
        ? await approveBuyerVerification(admin, id, parsed.data.notes)
        : parsed.data.action === "request_more_information"
          ? await requestBuyerVerificationInfo(admin, id, parsed.data.notes)
          : await rejectBuyerVerification(admin, id, parsed.data.notes);
    if (!changed) throw new AppError("Buyer verification not found.", 404);
    return NextResponse.json({ message: "Buyer verification updated." });
  } catch (error) {
    return failure(error);
  }
}
