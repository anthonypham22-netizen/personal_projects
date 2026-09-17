import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { seed } from "../src/lib/seed.ts";

test("the actual database schema and demo seed initialize and remain idempotent", () => {
  const source = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
  const schema = source.match(/d\.exec\(`([\s\S]*?)`\);/)?.[1];
  assert.ok(schema, "Database initialization SQL exists");
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-schema-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(schema);
    seed(database, directory);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM deals").get().count, 6);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM users").get().count, 5);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM documents").get().count, 6);
    seed(database, directory);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM deals").get().count, 6);
    for (const document of database.prepare("SELECT storage_key FROM documents").all()) {
      const file = readFileSync(path.join(directory, "uploads", document.storage_key), "utf8");
      assert.match(file, /FICTIONAL DEMONSTRATION/);
    }
    assert.throws(() => database.prepare("INSERT INTO access(id,deal_id,buyer_id) VALUES('duplicate','cedar','demo-buyer')").run(), /UNIQUE constraint/);
    assert.throws(() => database.prepare("INSERT INTO access(id,deal_id,buyer_id) VALUES('missing','nonexistent','demo-buyer')").run(), /FOREIGN KEY constraint/);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});
