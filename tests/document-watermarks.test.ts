import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import {
  getOrCreatePersonalizedPdf,
  personalizedWatermarkDetails,
  assertWatermarkablePdf,
} from "../src/lib/document-watermarks";
import { runMigrations } from "../src/lib/migrations/index.ts";
import { seed } from "../src/lib/seed.ts";

let database: DatabaseSync;
let directory: string;
let originalBytes: Buffer;

const variantCount = (documentId: string, buyerId = "demo-buyer") =>
  (
    database
      .prepare(
        "SELECT COUNT(*) count FROM document_watermark_variants WHERE document_id=? AND buyer_id=?",
      )
      .get(documentId, buyerId) as { count: number }
  ).count;

const insertWatermarkDocument = (id: string) => {
  database
    .prepare(
      `INSERT INTO documents(
        id,deal_id,name,storage_key,mime,category,size,version,audience,buyer_id,
        uploaded_by,watermark_enabled
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`,
    )
    .run(
      id,
      "cedar",
      `${id} CIM.pdf`,
      "watermark-source",
      "application/pdf",
      "Company overview",
      originalBytes.length,
      1,
      "approved",
      null,
      "demo-advisor",
    );
};

const renderedText = async (bytes: Uint8Array) => {
  const pdf = await PDFDocument.load(bytes);
  const text: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, index) =>
            contents.lookup(index, PDFRawStream),
          )
        : contents instanceof PDFRawStream
          ? [contents]
          : [];
    for (const stream of streams) {
      const content = Buffer.from(decodePDFRawStream(stream).decode()).toString(
        "latin1",
      );
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g))
        text.push(Buffer.from(match[1], "hex").toString("latin1"));
    }
  }
  return text.join("\n");
};

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-watermarks-"));
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  runMigrations(database);
  seed(database, directory);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  page.drawText("Project Cedar confidential information memorandum", {
    x: 72,
    y: 720,
    size: 18,
  });
  originalBytes = Buffer.from(await pdf.save());
  await mkdir(path.join(directory, "uploads"), { recursive: true });
  writeFileSync(
    path.join(directory, "uploads", "watermark-source"),
    originalBytes,
  );
});

after(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test("personalized watermark details identify the recipient and transaction", () => {
  assert.deepEqual(
    personalizedWatermarkDetails({
      organizationName: "Evergreen Capital",
      buyerEmail: "buyer@example.test",
      dealId: "cedar",
      now: new Date("2026-09-23T14:00:00.000Z"),
    }),
    {
      confidentialityLabel: "CONFIDENTIAL",
      recipient: "Provided to Evergreen Capital",
      email: "buyer@example.test",
      date: "September 23, 2026",
      transactionReference: "Succera Transaction SC-0C2746",
    },
  );
});

test("a personalized PDF is cached per buyer without changing the original", async () => {
  insertWatermarkDocument("cached-document");
  const input = {
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "cached-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  };
  const first = await getOrCreatePersonalizedPdf(input);
  const second = await getOrCreatePersonalizedPdf(input);

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.storageKey, first.storageKey);
  assert.notDeepEqual(first.bytes, originalBytes);
  const watermarkText = await renderedText(first.bytes);
  assert.match(watermarkText, /CONFIDENTIAL/);
  assert.match(watermarkText, /Provided to Evergreen Capital/);
  assert.match(watermarkText, /buyer@example\.test/);
  assert.match(watermarkText, /September 23, 2026/);
  assert.match(watermarkText, /Succera Transaction SC-0C2746/);
  assert.deepEqual(
    readFileSync(path.join(directory, "uploads", "watermark-source")),
    originalBytes,
    "the uploaded original must remain unchanged",
  );
  assert.deepEqual(
    readFileSync(path.join(directory, "watermarks", first.storageKey)),
    first.bytes,
  );
  assert.equal(variantCount("cached-document"), 1);
});

test("a changed watermark identity replaces the cached derivative", async () => {
  insertWatermarkDocument("changed-document");
  const before = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "changed-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  });
  const replacement = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "changed-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital Partners",
    dealId: "cedar",
    now: new Date("2026-09-24T14:00:00.000Z"),
  });

  assert.equal(replacement.cacheHit, false);
  assert.notEqual(replacement.storageKey, before.storageKey);
  assert.equal(
    existsSync(path.join(directory, "watermarks", before.storageKey)),
    false,
    "obsolete derivatives should not accumulate",
  );
  assert.equal(variantCount("changed-document"), 1);
});

test("a missing cached derivative is regenerated safely", async () => {
  insertWatermarkDocument("missing-document");
  const before = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "missing-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  });
  unlinkSync(path.join(directory, "watermarks", before.storageKey));

  const replacement = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "missing-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital Partners",
    dealId: "cedar",
    now: new Date("2026-09-24T14:00:00.000Z"),
  });

  assert.equal(replacement.cacheHit, false);
  assert.notEqual(replacement.storageKey, before.storageKey);
  assert.equal(variantCount("missing-document"), 1);
});

test("Unicode buyer identities still produce a recoverable personalized PDF", async () => {
  insertWatermarkDocument("unicode-document");
  const result = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "unicode-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "株式会社🍁 Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  });
  const watermarkText = await renderedText(result.bytes);
  assert.match(
    watermarkText,
    /Provided to <U\+682A><U\+5F0F><U\+4F1A><U\+793E><U\+1F341> Capital/,
  );
  assert.ok(result.bytes.length > 0);
});

test("concurrent cache misses generate one variant per buyer", async () => {
  insertWatermarkDocument("concurrent-document");
  const input = {
    database,
    dataDirectory: directory,
    originalBytes,
    document: { id: "concurrent-document", storageKey: "watermark-source" },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  };
  const results = await Promise.all([
    getOrCreatePersonalizedPdf(input),
    getOrCreatePersonalizedPdf(input),
    getOrCreatePersonalizedPdf(input),
  ]);
  assert.equal(new Set(results.map((result) => result.storageKey)).size, 1);
  assert.equal(variantCount("concurrent-document"), 1);
  const followUp = await getOrCreatePersonalizedPdf(input);
  assert.equal(followUp.cacheHit, true);
  assert.equal(followUp.storageKey, results[0].storageKey);
});

test("watermark cache variants remain isolated between buyers", async () => {
  insertWatermarkDocument("buyer-isolation-document");
  const first = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: {
      id: "buyer-isolation-document",
      storageKey: "watermark-source",
    },
    buyer: { id: "demo-buyer", email: "buyer@example.test" },
    organizationName: "Evergreen Capital",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  });
  const second = await getOrCreatePersonalizedPdf({
    database,
    dataDirectory: directory,
    originalBytes,
    document: {
      id: "buyer-isolation-document",
      storageKey: "watermark-source",
    },
    buyer: { id: "demo-buyer-2", email: "second@example.test" },
    organizationName: "Maple Acquisitions",
    dealId: "cedar",
    now: new Date("2026-09-23T14:00:00.000Z"),
  });
  assert.notEqual(first.storageKey, second.storageKey);
  assert.equal(variantCount("buyer-isolation-document", "demo-buyer"), 1);
  assert.equal(variantCount("buyer-isolation-document", "demo-buyer-2"), 1);
  assert.match(await renderedText(second.bytes), /second@example\.test/);
});

test("malformed PDFs are rejected before watermarking is enabled", async () => {
  await assert.rejects(
    assertWatermarkablePdf(Buffer.from("%PDF-1.7\nnot a valid PDF")),
    /requires an unencrypted, valid PDF/,
  );
});
