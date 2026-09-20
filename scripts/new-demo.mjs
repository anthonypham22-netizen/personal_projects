#!/usr/bin/env node
/** Administrator-run reset: create a NEW fictional database; never overwrite an existing one. */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import { seed } from "../src/lib/seed.ts";
import { refreshDemoDocuments } from "../src/lib/demo-documents.ts";

const parent = path.resolve("data/demo-sessions");
mkdirSync(parent, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(path.join(parent, "session-"));
const source = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
const schema = source.match(/d\.exec\(`([\s\S]*?)`\);/)?.[1];
if (!schema) throw new Error("Cannot locate the current initialization schema. No existing database was changed.");
const database = new DatabaseSync(path.join(directory, "northlane.sqlite"));
try {
  database.exec(schema);
  seed(database, directory);
  const count = refreshDemoDocuments(database, directory);
  if (count !== 6) throw new Error("Expected six fictional PDF fixtures in the fresh demo.");
  console.log(`Fresh fictional demo created at: ${directory}`);
  console.log("No existing database, uploads, sessions or deployment settings were changed.");
  console.log("Stop the old preview, set DATA_DIR to the directory above, set ALLOW_DEMO=true and ALLOW_REGISTRATION=false, then restart.");
  console.log("Use only behind restricted access. This command does not add a hosting access gate or make the app Vercel-compatible.");
} finally {
  database.close();
}
