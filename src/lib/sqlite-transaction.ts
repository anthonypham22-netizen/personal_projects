import type { DatabaseSync } from "node:sqlite";

export function inImmediateTransaction<T>(
  database: DatabaseSync,
  operation: () => T,
): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original failure if SQLite already ended the transaction.
    }
    throw error;
  }
}
