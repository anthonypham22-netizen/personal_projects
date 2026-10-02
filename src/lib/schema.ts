import type { DatabaseClient } from "./db";

export async function tableExists(database: DatabaseClient, name: string) {
  if (typeof (database as DatabaseClient).transaction !== "function")
    return Boolean(
      await database
        .prepare("select 1 from sqlite_master where type='table' and name=?")
        .get(name),
    );
  return Boolean(
    await database
      .prepare(
        `select 1 from information_schema.tables
         where table_schema='public' and table_name=?`,
      )
      .get(name),
  );
}

export async function columnExists(
  database: DatabaseClient,
  tableName: string,
  columnName: string,
) {
  if (typeof (database as DatabaseClient).transaction !== "function") {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName))
      throw new Error("Invalid table name");

    const columns = (await database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()) as Array<{ name?: string }>;
    return columns.some((column) => column.name === columnName);
  }

  return Boolean(
    await database
      .prepare(
        `select 1 from information_schema.columns
         where table_schema='public' and table_name=? and column_name=?`,
      )
      .get(tableName, columnName),
  );
}
