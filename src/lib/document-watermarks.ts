import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  degrees,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { AppError } from "./service";
import { inImmediateTransaction } from "./sqlite-transaction";

const WATERMARK_FORMAT_VERSION = 1;

type PersonalizedWatermarkDetailsInput = {
  organizationName: string;
  buyerEmail: string;
  dealId: string;
  now?: Date;
};

export type PersonalizedWatermarkDetails = {
  confidentialityLabel: "CONFIDENTIAL";
  recipient: string;
  email: string;
  date: string;
  transactionReference: string;
};

type WatermarkVariantRow = {
  storage_key: string;
  source_sha256: string;
  watermark_signature: string;
  content_sha256: string;
};

type PersonalizedPdfInput = {
  database: DatabaseSync;
  dataDirectory: string;
  originalBytes: Uint8Array;
  document: { id: string; storageKey: string };
  buyer: { id: string; email: string };
  organizationName: string;
  dealId: string;
  now?: Date;
};

export type PersonalizedPdfResult = {
  bytes: Buffer;
  cacheHit: boolean;
  storageKey: string;
};

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

const safeCacheKey = (value: string) => path.basename(value) === value;

// StandardFonts use WinAnsi. Preserve unsupported recipient code points as
// readable, reversible U+ tokens instead of allowing pdf-lib to throw.
const pdfSafeText = (font: PDFFont, text: string) =>
  Array.from(text, (character) => {
    try {
      font.encodeText(character);
      return character;
    } catch {
      const codePoint = character.codePointAt(0)!.toString(16).toUpperCase();
      return `<U+${codePoint.padStart(4, "0")}>`;
    }
  }).join("");

const inFlightGenerations = new Map<string, Promise<PersonalizedPdfResult>>();

export function personalizedWatermarkDetails({
  organizationName,
  buyerEmail,
  dealId,
  now = new Date(),
}: PersonalizedWatermarkDetailsInput): PersonalizedWatermarkDetails {
  const reference = sha256(dealId).slice(0, 6).toUpperCase();
  return {
    confidentialityLabel: "CONFIDENTIAL",
    recipient: `Provided to ${organizationName.trim() || "approved buyer"}`,
    email: buyerEmail.trim().toLowerCase(),
    date: new Intl.DateTimeFormat("en-CA", {
      dateStyle: "long",
      timeZone: "America/Toronto",
    }).format(now),
    transactionReference: `Succera Transaction SC-${reference}`,
  };
}

const fitText = (
  page: PDFPage,
  text: string,
  font: PDFFont,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    size: number;
    minSize?: number;
    opacity?: number;
  },
) => {
  let size = options.size;
  const minSize = options.minSize ?? 5;
  while (
    size > minSize &&
    font.widthOfTextAtSize(text, size) > options.maxWidth
  )
    size -= 0.25;
  page.drawText(text, {
    x: options.x,
    y: options.y,
    size,
    font,
    color: rgb(0.03, 0.31, 0.24),
    opacity: options.opacity ?? 0.86,
  });
};

async function renderPersonalizedPdf(
  originalBytes: Uint8Array,
  details: PersonalizedWatermarkDetails,
) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(originalBytes);
  } catch {
    throw new AppError(
      "This PDF cannot be personalized. Upload an unencrypted, valid PDF or turn off personalized watermarking.",
      422,
    );
  }
  if (!pdf.getPageCount())
    throw new AppError(
      "This PDF has no pages and cannot be personalized.",
      422,
    );
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const margin = Math.max(18, Math.min(36, width * 0.06));
    const footerWidth = Math.max(120, width - margin * 2);
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: Math.min(44, Math.max(34, height * 0.055)),
      color: rgb(1, 1, 1),
      opacity: 0.9,
    });
    page.drawLine({
      start: { x: margin, y: 41 },
      end: { x: width - margin, y: 41 },
      thickness: 0.75,
      color: rgb(0.03, 0.31, 0.24),
      opacity: 0.45,
    });
    fitText(
      page,
      pdfSafeText(
        bold,
        `${details.confidentialityLabel} · ${details.recipient} · ${details.email}`,
      ),
      bold,
      { x: margin, y: 25, maxWidth: footerWidth, size: 7.5 },
    );
    fitText(
      page,
      pdfSafeText(regular, `${details.date} · ${details.transactionReference}`),
      regular,
      { x: margin, y: 13, maxWidth: footerWidth, size: 7 },
    );
    const diagonalSize = Math.max(26, Math.min(64, width * 0.095));
    page.drawText(details.confidentialityLabel, {
      x: Math.max(24, width * 0.11),
      y: Math.max(80, height * 0.42),
      size: diagonalSize,
      font: bold,
      color: rgb(0.03, 0.31, 0.24),
      opacity: 0.075,
      rotate: degrees(34),
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

const getCachedPersonalizedPdf = async ({
  database,
  dataDirectory,
  document,
  buyer,
  sourceSha256,
  watermarkSignature,
}: {
  database: DatabaseSync;
  dataDirectory: string;
  document: { id: string };
  buyer: { id: string };
  sourceSha256: string;
  watermarkSignature: string;
}): Promise<PersonalizedPdfResult | undefined> => {
  const existing = database
    .prepare(
      `SELECT storage_key,source_sha256,watermark_signature,content_sha256
       FROM document_watermark_variants WHERE document_id=? AND buyer_id=?`,
    )
    .get(document.id, buyer.id) as WatermarkVariantRow | undefined;
  if (
    !existing ||
    existing.source_sha256 !== sourceSha256 ||
    existing.watermark_signature !== watermarkSignature ||
    !safeCacheKey(existing.storage_key)
  )
    return undefined;
  try {
    const bytes = await readFile(
      path.join(dataDirectory, "watermarks", existing.storage_key),
    );
    if (sha256(bytes) !== existing.content_sha256) return undefined;
    database
      .prepare(
        `UPDATE document_watermark_variants
         SET last_accessed_at=CURRENT_TIMESTAMP
         WHERE document_id=? AND buyer_id=?`,
      )
      .run(document.id, buyer.id);
    return { bytes, cacheHit: true, storageKey: existing.storage_key };
  } catch {
    // A missing or corrupt derived file is safe to regenerate from the original.
    return undefined;
  }
};

export async function assertWatermarkablePdf(bytes: Uint8Array) {
  try {
    const pdf = await PDFDocument.load(bytes);
    if (!pdf.getPageCount()) throw new Error("empty PDF");
  } catch {
    throw new AppError(
      "Personalized watermarking requires an unencrypted, valid PDF with at least one page.",
    );
  }
}

export async function getOrCreatePersonalizedPdf({
  database,
  dataDirectory,
  originalBytes,
  document,
  buyer,
  organizationName,
  dealId,
  now = new Date(),
}: PersonalizedPdfInput): Promise<PersonalizedPdfResult> {
  const details = personalizedWatermarkDetails({
    organizationName,
    buyerEmail: buyer.email,
    dealId,
    now,
  });
  const sourceSha256 = sha256(originalBytes);
  const watermarkSignature = sha256(
    JSON.stringify({
      version: WATERMARK_FORMAT_VERSION,
      sourceStorageKey: document.storageKey,
      sourceSha256,
      buyerId: buyer.id,
      ...details,
    }),
  );
  const cached = await getCachedPersonalizedPdf({
    database,
    dataDirectory,
    document,
    buyer,
    sourceSha256,
    watermarkSignature,
  });
  if (cached) return cached;

  const lockKey = `${document.id}:${buyer.id}:${watermarkSignature}`;
  const pending = inFlightGenerations.get(lockKey);
  if (pending) return pending;

  const generation = (async () => {
    const cachedAfterLock = await getCachedPersonalizedPdf({
      database,
      dataDirectory,
      document,
      buyer,
      sourceSha256,
      watermarkSignature,
    });
    if (cachedAfterLock) return cachedAfterLock;

    const cacheDirectory = path.join(dataDirectory, "watermarks");
    const bytes = await renderPersonalizedPdf(originalBytes, details);
    const contentSha256 = sha256(bytes);
    const storageKey = randomUUID();
    await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
    const storedPath = path.join(cacheDirectory, storageKey);
    await writeFile(storedPath, bytes, { mode: 0o600, flag: "wx" });
    let oldStorageKey: string | undefined;
    try {
      inImmediateTransaction(database, () => {
        oldStorageKey = (
          database
            .prepare(
              "SELECT storage_key FROM document_watermark_variants WHERE document_id=? AND buyer_id=?",
            )
            .get(document.id, buyer.id) as { storage_key: string } | undefined
        )?.storage_key;
        database
          .prepare(
            `INSERT INTO document_watermark_variants(
               id,document_id,buyer_id,storage_key,source_sha256,
               watermark_signature,content_sha256
             ) VALUES(?,?,?,?,?,?,?)
             ON CONFLICT(document_id,buyer_id) DO UPDATE SET
               storage_key=excluded.storage_key,
               source_sha256=excluded.source_sha256,
               watermark_signature=excluded.watermark_signature,
               content_sha256=excluded.content_sha256,
               generated_at=CURRENT_TIMESTAMP,
               last_accessed_at=CURRENT_TIMESTAMP`,
          )
          .run(
            randomUUID(),
            document.id,
            buyer.id,
            storageKey,
            sourceSha256,
            watermarkSignature,
            contentSha256,
          );
      });
    } catch (error) {
      await unlink(storedPath).catch(() => {});
      throw error;
    }
    if (
      oldStorageKey &&
      oldStorageKey !== storageKey &&
      safeCacheKey(oldStorageKey)
    )
      await unlink(path.join(cacheDirectory, oldStorageKey)).catch(() => {});
    return { bytes, cacheHit: false, storageKey };
  })();
  const trackedGeneration = generation.finally(() => {
    if (inFlightGenerations.get(lockKey) === trackedGeneration)
      inFlightGenerations.delete(lockKey);
  });
  inFlightGenerations.set(lockKey, trackedGeneration);
  return trackedGeneration;
}
