import type { DatabaseSync } from "node:sqlite";

export function tableExists(database: DatabaseSync, table: string) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table),
  );
}
