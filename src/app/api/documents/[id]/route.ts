import { currentUser } from "@/lib/auth";
import { dataDirectory, db, one } from "@/lib/db";
import {
  AppError,
  canReadDocument,
  getDeal,
  audit,
  organizationFor,
} from "@/lib/service";
import { failure } from "@/lib/http";
import type { Document } from "@/lib/types";
import { getOrCreatePersonalizedPdf } from "@/lib/document-watermarks";
import { privateFileStore } from "@/lib/private-file-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    const { id } = await params;
    const doc = await one<
      Omit<Document, "watermark_enabled"> & {
        storage_key: string;
        mime: string;
        watermark_enabled: number;
      }
    >("SELECT * FROM documents WHERE id=?", id);
    const deal = doc ? await getDeal(doc.deal_id) : undefined;
    if (!doc || !deal || !(await canReadDocument(user, deal, doc)))
      throw new AppError("Document not found or access is restricted.", 404);
    const original = await privateFileStore().read("uploads", doc.storage_key);
    let file: Uint8Array = original;
    let personalized = false;
    if (
      user.role === "buyer" &&
      Boolean(doc.watermark_enabled) &&
      doc.mime === "application/pdf"
    ) {
      const organization = await organizationFor(user.id);
      if (!organization)
        throw new AppError(
          "Your buyer account is not connected to an organization.",
          500,
        );
      file = (
        await getOrCreatePersonalizedPdf({
          database: db(),
          dataDirectory: dataDirectory(),
          originalBytes: original,
          document: { id: doc.id, storageKey: doc.storage_key },
          buyer: { id: user.id, email: user.email },
          organizationName: organization.name,
          dealId: deal.id,
        })
      ).bytes;
      personalized = true;
    }
    await audit(
      user,
      doc.deal_id,
      personalized
        ? "Downloaded a personalized watermarked document"
        : "Downloaded a document",
    );
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(personalized
          ? { "X-Succera-Personalized-Watermark": "applied" }
          : {}),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
