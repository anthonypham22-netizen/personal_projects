import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { freshPostgresDatabase } from "./postgres-test-db";

test("fresh Postgres migrations create the complete protected schema", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-pg-schema-"));
  const database = await freshPostgresDatabase(directory, false);
  try {
    const tables = await database
      .prepare(
        `SELECT tablename FROM pg_tables
         WHERE schemaname='public' ORDER BY tablename`,
      )
      .all<{ tablename: string }>();
    const names = tables.map(({ tablename }) => tablename);
    for (const table of [
      "users",
      "sessions",
      "rate_limits",
      "deals",
      "access",
      "documents",
      "messages",
      "tasks",
      "offers",
      "activity",
      "buyer_verifications",
    ])
      assert.ok(names.includes(table), `missing public.${table}`);
    assert.equal(names.length, 42);

    const rlsDisabled = await database
      .prepare(
        `SELECT c.relname table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`,
      )
      .all<{ table_name: string }>();
    assert.deepEqual(rlsDisabled, []);

    const invalidForeignKeys = await database
      .prepare(
        `SELECT conname FROM pg_constraint
         WHERE contype='f' AND NOT convalidated`,
      )
      .all<{ conname: string }>();
    assert.deepEqual(invalidForeignKeys, []);

    const missingForeignKeyIndexes = await database
      .prepare(
        `SELECT conrelid::regclass::text table_name,conname
         FROM pg_constraint c
         WHERE contype='f' AND NOT EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid=c.conrelid AND i.indisvalid
             AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey
         ) ORDER BY 1,2`,
      )
      .all<{ table_name: string; conname: string }>();
    assert.deepEqual(missingForeignKeyIndexes, []);

    const buyerVerification = await database
      .prepare(
        `SELECT data_type,is_nullable
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name='buyer_verifications'
           AND column_name='submitted_at'`,
      )
      .get<{ data_type: string; is_nullable: string }>();
    assert.deepEqual(buyerVerification, {
      data_type: "timestamp with time zone",
      is_nullable: "YES",
    });

    await assert.rejects(
      database
        .prepare(
          `INSERT INTO buyer_verifications(
             user_id,status,buyer_type,source_of_capital,equity_range,
             completed_acquisitions,experience_summary,acquisition_strategy,
             authorized_to_represent
           ) VALUES('missing-user','self_approved','other','other','5m_plus',0,
             'A sufficiently long experience summary.',
             'A sufficiently long acquisition strategy.',true)`,
        )
        .run(),
    );
  } finally {
    await database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
