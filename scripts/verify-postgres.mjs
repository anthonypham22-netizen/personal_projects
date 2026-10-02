import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const tableCount = Number(
    (
      await pool.query(
        "SELECT COUNT(*)::integer count FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0].count,
  );
  const rlsDisabled = (
    await pool.query(
      `SELECT c.relname table_name
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`,
    )
  ).rows;
  const unvalidatedForeignKeys = (
    await pool.query(
      `SELECT conrelid::regclass::text table_name,conname
       FROM pg_constraint WHERE contype='f' AND NOT convalidated`,
    )
  ).rows;
  const missingForeignKeyIndexes = (
    await pool.query(
      `SELECT conrelid::regclass::text table_name,conname
       FROM pg_constraint c
       WHERE contype='f' AND NOT EXISTS (
         SELECT 1 FROM pg_index i
         WHERE i.indrelid=c.conrelid AND i.indisvalid
           AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey
       ) ORDER BY 1,2`,
    )
  ).rows;
  const exposedPrivileges = (
    await pool.query(
      `SELECT grantee,table_name,privilege_type
       FROM information_schema.table_privileges
       WHERE table_schema='public' AND grantee IN ('anon','authenticated')
       ORDER BY grantee,table_name,privilege_type`,
    )
  ).rows;
  const report = {
    tableCount,
    rlsDisabled,
    unvalidatedForeignKeys,
    missingForeignKeyIndexes,
    exposedPrivileges,
  };
  console.log(JSON.stringify(report, null, 2));
  if (
    tableCount < 42 ||
    rlsDisabled.length ||
    unvalidatedForeignKeys.length ||
    missingForeignKeyIndexes.length ||
    exposedPrivileges.length
  )
    throw new Error("PostgreSQL verification failed.");
} finally {
  await pool.end();
}
