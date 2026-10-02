import type { DatabaseClient } from "./db";

const legacyTransactionDepth = new WeakMap<object, number>();

export function inTransaction<T>(
  database: DatabaseClient,
  operation: (database: DatabaseClient) => Promise<T>,
) {
  if (typeof database.transaction === "function")
    return database.transaction(operation);

  return (async () => {
    const target = database as object;
    const depth = legacyTransactionDepth.get(target) ?? 0;
    const savepoint = `succera_legacy_transaction_${depth}`;

    if (depth === 0) await database.exec("BEGIN IMMEDIATE");
    else await database.exec(`SAVEPOINT ${savepoint}`);
    legacyTransactionDepth.set(target, depth + 1);

    try {
      const result = await operation(database);
      if (depth === 0) await database.exec("COMMIT");
      else await database.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      if (depth === 0) await database.exec("ROLLBACK");
      else {
        await database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await database.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
      throw error;
    } finally {
      if (depth === 0) legacyTransactionDepth.delete(target);
      else legacyTransactionDepth.set(target, depth);
    }
  })();
}
