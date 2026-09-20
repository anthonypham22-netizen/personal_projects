import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

test("new-demo creates separate fresh sessions without changing an existing session", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "acquire-fresh-demo-"));
  const script = fileURLToPath(new URL("../scripts/new-demo.mjs", import.meta.url));
  try {
    for (let i = 0; i < 2; i++) {
      const result = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /No existing database/);
      if (i === 0) {
        const first = readdirSync(path.join(cwd, "data/demo-sessions"))[0];
        writeFileSync(path.join(cwd, "data/demo-sessions", first, "preserve-me.txt"), "Existing session retained");
      }
    }
    const sessions = readdirSync(path.join(cwd, "data/demo-sessions"));
    assert.equal(sessions.length, 2);
    let retained = 0;
    for (const session of sessions) {
      const directory = path.join(cwd, "data/demo-sessions", session);
      if (readdirSync(directory).includes("preserve-me.txt")) {
        assert.equal(readFileSync(path.join(directory, "preserve-me.txt"), "utf8"), "Existing session retained");
        retained++;
      }
      const db = new DatabaseSync(path.join(directory, "northlane.sqlite"));
      try {
        assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE is_demo=0").get().n, 0);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM deals").get().n, 6);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM documents WHERE mime='application/pdf'").get().n, 6);
      } finally { db.close(); }
    }
    assert.equal(retained, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
