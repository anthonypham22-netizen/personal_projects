import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/backup.mjs", import.meta.url));

for (const missing of [false, true]) {
  test(`private upload backup ${missing ? "rejects a missing upload store" : "preserves uploaded files"}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "northlane-backup-"));
    try {
      if (!missing) {
        mkdirSync(path.join(directory, "uploads"));
        writeFileSync(
          path.join(directory, "uploads", "fixture.txt"),
          "Fictional test document",
        );
      }
      const result = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        env: { ...process.env, DATA_DIR: directory },
      });
      assert.equal(result.status, missing ? 1 : 0, result.stderr);
      if (missing) {
        assert.doesNotMatch(result.stdout, /Private upload backup created/);
      } else {
        const output = path.join(
          directory,
          "backups",
          readdirSync(path.join(directory, "backups"))[0],
        );
        assert.match(result.stdout, /Private upload backup created/);
        assert.equal(
          readFileSync(path.join(output, "uploads", "fixture.txt"), "utf8"),
          "Fictional test document",
        );
        const manifest = JSON.parse(
          readFileSync(path.join(output, "manifest.json"), "utf8"),
        );
        assert.equal(manifest.formatVersion, 2);
        assert.deepEqual(manifest.contents, ["private-uploads"]);
        assert.match(manifest.databaseBackup, /Supabase/);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
