import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrivateFileStore } from "../src/lib/private-file-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("local private storage writes, reads, and removes files beneath DATA_DIR", async () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), "succera-storage-"));
  temporaryDirectories.push(dataDirectory);
  const store = createPrivateFileStore({
    provider: "filesystem",
    dataDirectory,
  });

  await store.write("uploads", "document-id", Buffer.from("confidential"), {
    contentType: "text/plain",
  });
  assert.equal(
    existsSync(path.join(dataDirectory, "uploads", "document-id")),
    true,
  );
  assert.equal(
    (await store.read("uploads", "document-id")).toString(),
    "confidential",
  );

  await store.delete("uploads", "document-id");
  assert.equal(
    existsSync(path.join(dataDirectory, "uploads", "document-id")),
    false,
  );
});

test("Vercel storage always uses private access and stable server-only paths", async () => {
  const calls: Array<{ operation: string; pathname: string; options?: unknown }> =
    [];
  const store = createPrivateFileStore({
    provider: "vercel_blob",
    dataDirectory: "/unused",
    blobClient: {
      async put(pathname, body, options) {
        calls.push({ operation: "put", pathname, options });
        assert.equal(Buffer.from(body as Uint8Array).toString(), "secret");
      },
      async get(pathname, options) {
        calls.push({ operation: "get", pathname, options });
        return Buffer.from("secret");
      },
      async del(pathname) {
        calls.push({ operation: "delete", pathname });
      },
    },
  });

  await store.write("watermarks", "variant-id", Buffer.from("secret"), {
    contentType: "application/pdf",
  });
  assert.equal(
    (await store.read("watermarks", "variant-id")).toString(),
    "secret",
  );
  await store.delete("watermarks", "variant-id");

  assert.deepEqual(calls, [
    {
      operation: "put",
      pathname: "watermarks/variant-id",
      options: {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        contentType: "application/pdf",
      },
    },
    {
      operation: "get",
      pathname: "watermarks/variant-id",
      options: { access: "private", useCache: false },
    },
    { operation: "delete", pathname: "watermarks/variant-id" },
  ]);
});

test("private storage rejects path traversal keys", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-storage-"));
  temporaryDirectories.push(directory);
  const store = createPrivateFileStore({
    provider: "filesystem",
    dataDirectory: directory,
  });

  await assert.rejects(
    () => store.read("uploads", "../outside"),
    /Invalid private storage key/,
  );
});
