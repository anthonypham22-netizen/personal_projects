import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, cp, chmod, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = path.resolve(process.env.DATA_DIR || "./data");
const databasePath = path.join(directory, "northlane.sqlite");
await access(databasePath);
const output = path.join(directory, "backups", `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0,8)}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const source = new DatabaseSync(databasePath, { readOnly: true });
try {
  await backup(source, path.join(output, "northlane.sqlite"));
  await chmod(path.join(output, "northlane.sqlite"), 0o600);
  try { await cp(path.join(directory, "uploads"), path.join(output, "uploads"), { recursive: true, errorOnExist: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const snapshot = new DatabaseSync(path.join(output, "northlane.sqlite"), { readOnly: true });
  try {
    for (const document of snapshot.prepare("SELECT storage_key FROM documents").all()) {
      if (path.basename(document.storage_key) !== document.storage_key) throw new Error("Invalid document storage key");
      await access(path.join(output, "uploads", document.storage_key));
    }
  } finally { snapshot.close(); }
  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), application: "northlane", formatVersion: 1 }, null, 2), { mode: 0o600 });
  console.log(`Backup created: ${output}`);
  console.log("Copy this directory to encrypted off-server storage and verify a restore. It includes confidential database records and uploaded files.");
} finally { source.close(); }
