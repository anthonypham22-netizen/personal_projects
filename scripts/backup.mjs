import { mkdir, cp, chmod, access, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const directory = path.resolve(process.env.DATA_DIR || "./data/dev");
const uploads = path.join(directory, "uploads");
await access(uploads);
const output = path.join(
  directory,
  "backups",
  `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`,
);
await mkdir(output, { recursive: true, mode: 0o700 });
await cp(uploads, path.join(output, "uploads"), {
  recursive: true,
  errorOnExist: true,
});
for (const entry of await readdir(path.join(output, "uploads"))) {
  if (path.basename(entry) !== entry)
    throw new Error("Invalid upload storage key.");
  await chmod(path.join(output, "uploads", entry), 0o600);
}
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      application: "succera",
      formatVersion: 2,
      contents: ["private-uploads"],
      databaseBackup: "Supabase managed backup / point-in-time recovery",
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Private upload backup created: ${output}`);
console.log(
  "Database records are backed up separately by Supabase. Export and restore-test both layers together.",
);
