import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import {
  buyerVerificationForAdmin,
  isAdmin,
  reviewBuyerIdentityVerification,
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
    const admin = await currentUser();
    if (!admin) throw new AppError("Please sign in.", 401);
    if (!isAdmin(admin))
      throw new AppError("Administrator access required.", 403);
    const { id } = await params;
    const existing = await buyerVerificationForAdmin(admin, id);
    if (!existing) throw new AppError("Buyer verification not found.", 404);
    const parsed = z
      .object({
        status: z.enum(["approved", "needs_info", "rejected"]),
        notes: z.string().trim().max(5000),
      })
      .safeParse(await jsonBody(request));
    if (!parsed.success)
      throw new AppError("Choose a valid decision and review note.");
    if (parsed.data.status !== "approved" && parsed.data.notes.length < 10)
      throw new AppError(
        "Explain what the buyer needs to change (at least 10 characters).",
      );
    const changed = await reviewBuyerIdentityVerification(
      admin,
      id,
      parsed.data.status,
      parsed.data.notes,
    );
    if (!changed) throw new AppError("Buyer verification not found.", 404);
    return NextResponse.json({ message: "Buyer verification updated." });
  } catch (error) {
    return failure(error);
  }
}
