import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/backup.mjs", import.meta.url));

for (const missing of [false, true]) {
  test(`backup ${missing ? "rejects missing referenced uploads" : "preserves database and referenced uploads"}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "northlane-backup-"));
    try {
      const database = new DatabaseSync(path.join(directory, "northlane.sqlite"));
      database.exec("CREATE TABLE documents (storage_key TEXT); INSERT INTO documents VALUES ('fixture.txt')");
      database.close();
      if (!missing) {
        mkdirSync(path.join(directory, "uploads"));
        writeFileSync(path.join(directory, "uploads", "fixture.txt"), "Fictional test document");
      }
      const result = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, DATA_DIR: directory } });
      assert.equal(result.status, missing ? 1 : 0, result.stderr);
      const output = path.join(directory, "backups", readdirSync(path.join(directory, "backups"))[0]);
      if (missing) {
        assert.doesNotMatch(result.stdout, /Backup created/);
        assert.ok(!readdirSync(output).includes("manifest.json"));
      } else {
        assert.match(result.stdout, /Backup created/);
        assert.equal(readFileSync(path.join(output, "uploads", "fixture.txt"), "utf8"), "Fictional test document");
        assert.equal(JSON.parse(readFileSync(path.join(output, "manifest.json"), "utf8")).formatVersion, 1);
        const restored = new DatabaseSync(path.join(output, "northlane.sqlite"), { readOnly: true });
        try { assert.equal(restored.prepare("SELECT storage_key FROM documents").get().storage_key, "fixture.txt"); }
        finally { restored.close(); }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
