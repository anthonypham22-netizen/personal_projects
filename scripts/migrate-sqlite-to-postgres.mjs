import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const argv = process.argv.slice(2);
const args = new Set(argv);
const execute = args.has("--execute");
const allowProduction = args.has("--allow-production");
const allowExisting = args.has("--allow-existing");
const sourceArgumentIndex = argv.indexOf("--source");
if (sourceArgumentIndex >= 0 && !argv[sourceArgumentIndex + 1])
  throw new Error("--source requires a SQLite file path.");
const sourcePath = path.resolve(
  (sourceArgumentIndex >= 0 ? argv[sourceArgumentIndex + 1] : undefined) ||
    process.env.SQLITE_SOURCE ||
    "./data/dev/northlane.sqlite",
);
const databaseUrl = process.env.DATABASE_URL?.trim();
const productionRef = "vtfzevaizyvgmynnyxsb";

const targetsProject = (value, projectRef) => {
  try {
    const parsed = new URL(value);
    return [
      ...parsed.hostname.toLowerCase().split("."),
      ...decodeURIComponent(parsed.username).toLowerCase().split("."),
    ].includes(projectRef);
  } catch {
    return false;
  }
};

await access(sourcePath);
if (execute && !databaseUrl)
  throw new Error("DATABASE_URL is required with --execute.");
if (
  execute &&
  targetsProject(databaseUrl, productionRef) &&
  (!allowProduction ||
    process.env.CONFIRM_PRODUCTION_SQLITE_IMPORT !== productionRef)
)
  throw new Error(
    `Production import is blocked. After reviewing the dry run, pass --allow-production and set CONFIRM_PRODUCTION_SQLITE_IMPORT=${productionRef}.`,
  );

const source = new DatabaseSync(sourcePath, { readOnly: true });
const quoted = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const tables = source
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
       AND name<>'schema_migrations'
     ORDER BY name`,
  )
  .all()
  .map(({ name }) => name);
const dependencies = new Map(
  tables.map((table) => [
    table,
    new Set(
      source
        .prepare(`PRAGMA foreign_key_list(${quoted(table)})`)
        .all()
        .map(({ table: parent }) => parent)
        .filter((parent) => tables.includes(parent)),
    ),
  ]),
);
const ordered = [];
const remaining = new Set(tables);
while (remaining.size) {
  const ready = [...remaining].filter((table) =>
    [...dependencies.get(table)].every((parent) => !remaining.has(parent)),
  );
  if (!ready.length)
    throw new Error("Could not resolve SQLite foreign-key order.");
  for (const table of ready.sort()) {
    ordered.push(table);
    remaining.delete(table);
  }
}

const counts = Object.fromEntries(
  ordered.map((table) => [
    table,
    source.prepare(`SELECT COUNT(*) count FROM ${quoted(table)}`).get().count,
  ]),
);
const userCounts = tables.includes("users")
  ? source
      .prepare(
        `SELECT is_demo,COUNT(*) count FROM users GROUP BY is_demo ORDER BY is_demo`,
      )
      .all()
  : [];
console.log(
  JSON.stringify(
    {
      mode: execute ? "execute" : "dry-run",
      source: sourcePath,
      tables: ordered.length,
      rows: Object.values(counts).reduce((total, count) => total + count, 0),
      users: userCounts,
      counts,
    },
    null,
    2,
  ),
);

if (!execute) {
  console.log(
    "Dry run only. No PostgreSQL connection was opened and no data changed.",
  );
  source.close();
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const targetTables = new Set(
    (
      await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE'`,
      )
    ).rows.map(({ table_name }) => table_name),
  );
  for (const table of ordered) {
    if (!targetTables.has(table))
      throw new Error(
        `Target schema is missing public.${table}. Apply migrations first.`,
      );
    const existingTargetCount = Number(
      (
        await client.query(
          `SELECT COUNT(*)::bigint count FROM public.${quoted(table)}`,
        )
      ).rows[0].count,
    );
    if (counts[table] && existingTargetCount && !allowExisting)
      throw new Error(
        `Target public.${table} already contains ${existingTargetCount} rows. Import into an empty migrated database or pass --allow-existing only after reconciling conflicts.`,
      );
    const sourceColumns = source
      .prepare(`PRAGMA table_info(${quoted(table)})`)
      .all()
      .map(({ name }) => name);
    const targetColumns = new Set(
      (
        await client.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1`,
          [table],
        )
      ).rows.map(({ column_name }) => column_name),
    );
    const columns = sourceColumns.filter((column) => targetColumns.has(column));
    if (!columns.length && counts[table])
      throw new Error(`No compatible columns found for ${table}.`);
    const rows = source.prepare(`SELECT * FROM ${quoted(table)}`).all();
    for (const row of rows) {
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
      await client.query(
        `INSERT INTO public.${quoted(table)} (${columns.map(quoted).join(",")})
         VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        columns.map((column) => row[column]),
      );
    }
    const targetCount = Number(
      (
        await client.query(
          `SELECT COUNT(*)::bigint count FROM public.${quoted(table)}`,
        )
      ).rows[0].count,
    );
    if (targetCount < counts[table])
      throw new Error(
        `Validation failed for ${table}: source=${counts[table]}, target=${targetCount}.`,
      );
  }
  await client.query("COMMIT");
  console.log(
    "Import committed. PostgreSQL foreign-key constraints remained active throughout.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  source.close();
  client.release();
  await pool.end();
}
