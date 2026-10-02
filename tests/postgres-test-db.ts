import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseClient } from "../src/lib/db";
import { seed } from "../src/lib/seed";

export async function freshPostgresDatabase(
  directory: string,
  seedData = true,
) {
  const engine = new PGlite();
  const database = new DatabaseClient(engine);
  const migrationDirectory = path.resolve("supabase/migrations");
  for (const file of (await readdir(migrationDirectory)).sort())
    if (file.endsWith(".sql"))
      await database.exec(
        await readFile(path.join(migrationDirectory, file), "utf8"),
      );
  if (seedData) await seed(database, directory);
  return database;
}
