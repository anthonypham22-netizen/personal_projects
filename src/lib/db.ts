import "server-only";

import { mkdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, types as pgTypes, type PoolClient } from "pg";
import {
  isDemoAllowed,
  isProduction,
  validateAppEnvironment,
} from "./app-environment";
import { seed } from "./seed";
import { ensureInitialMatchBackfill } from "./match-store";
import { ensureBuyerFunnelBackfill } from "./buyer-funnel";
import { ensureTransactionAttributionBackfill } from "./transaction-attribution";

export type DatabaseValue = unknown;
export type RunResult = { changes: number };

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
  affectedRows?: number;
};
type Queryable = {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  exec?(sql: string): Promise<unknown>;
};

const PRODUCTION_PROJECT_REF = "vtfzevaizyvgmynnyxsb";

function databaseUrlTargetsProject(value: string, projectRef: string) {
  try {
    const parsed = new URL(value);
    const identifiers = [
      ...parsed.hostname.toLowerCase().split("."),
      ...decodeURIComponent(parsed.username).toLowerCase().split("."),
    ];
    return identifiers.includes(projectRef);
  } catch {
    return false;
  }
}

export const dataDirectory = () =>
  path.resolve(process.env.DATA_DIR || "./data/dev");

const migrationDirectory = path.resolve("supabase/migrations");

const normalizeValue = (key: string, value: unknown): unknown => {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date)
    return key.endsWith("_date")
      ? value.toISOString().slice(0, 10)
      : value.toISOString();
  if (key.endsWith("_json") && value !== null && typeof value === "object")
    return JSON.stringify(value);
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (
      Number.isSafeInteger(numeric) ||
      key.includes("margin") ||
      key.includes("percentage")
    )
      return numeric;
  }
  return value;
};

const normalizeRow = <T>(row: Record<string, unknown>): T =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      normalizeValue(key, value),
    ]),
  ) as T;

function postgresPlaceholders(sql: string) {
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let output = "";
  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const character = sql[cursor];
    if (character === "'" && !doubleQuoted) {
      output += character;
      if (singleQuoted && sql[cursor + 1] === "'") {
        output += sql[cursor + 1];
        cursor += 1;
      } else singleQuoted = !singleQuoted;
      continue;
    }
    if (character === '"' && !singleQuoted) doubleQuoted = !doubleQuoted;
    if (character === "?" && !singleQuoted && !doubleQuoted) {
      index += 1;
      output += `$${index}`;
    } else output += character;
  }
  return output;
}

function postgresSql(sql: string) {
  const ignoredInsert = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  let result = sql
    .replace(/strftime\('%Y-%m-%d %H:%M:%f','now'\)/gi, "CURRENT_TIMESTAMP")
    .replace(
      /datetime\('now','-15 minutes'\)/gi,
      "CURRENT_TIMESTAMP - INTERVAL '15 minutes'",
    )
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
  result = postgresPlaceholders(result.trim().replace(/;$/, ""));
  if (ignoredInsert && !/\bON\s+CONFLICT\b/i.test(result))
    result += " ON CONFLICT DO NOTHING";
  return result;
}

class AsyncRows<T> implements PromiseLike<T[]> {
  constructor(private readonly promise: Promise<T[]>) {}

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  map<U>(
    callback: (value: T, index: number, array: T[]) => U | Promise<U>,
  ): AsyncRows<Awaited<U>> {
    return new AsyncRows(
      this.promise.then((rows) => Promise.all(rows.map(callback))),
    );
  }

  filter(
    callback: (
      value: T,
      index: number,
      array: T[],
    ) => boolean | Promise<boolean>,
  ): AsyncRows<T> {
    return new AsyncRows(
      this.promise.then(async (rows) => {
        const decisions = await Promise.all(rows.map(callback));
        return rows.filter((_, index) => decisions[index]);
      }),
    );
  }
}

class Statement {
  constructor(
    private readonly client: DatabaseClient,
    private readonly sql: string,
  ) {}

  all<T = Record<string, unknown>>(...params: DatabaseValue[]): AsyncRows<T> {
    return new AsyncRows(
      this.client
        .query(this.sql, params)
        .then((result) => result.rows.map((row) => normalizeRow<T>(row))),
    );
  }

  async get<T = Record<string, unknown>>(
    ...params: DatabaseValue[]
  ): Promise<T | undefined> {
    const rows = await this.all<T>(...params);
    return rows[0];
  }

  async run(...params: DatabaseValue[]): Promise<RunResult> {
    const result = await this.client.query(this.sql, params);
    return { changes: result.rowCount ?? result.affectedRows ?? 0 };
  }
}

export class DatabaseClient {
  constructor(
    private readonly queryable: Queryable,
    private readonly transactionDepth = 0,
  ) {}

  prepare(sql: string) {
    return new Statement(this, sql);
  }

  async query(sql: string, params: DatabaseValue[] = []) {
    return this.queryable.query(postgresSql(sql), params);
  }

  async exec(sql: string) {
    if (this.queryable.exec) return this.queryable.exec(sql);
    return this.queryable.query(sql);
  }

  async transaction<T>(
    operation: (database: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (this.transactionDepth > 0) {
      const savepoint = `succera_${this.transactionDepth}`;
      await this.queryable.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await operation(
          new DatabaseClient(this.queryable, this.transactionDepth + 1),
        );
        await this.queryable.query(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        await this.queryable.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await this.queryable.query(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    }
    if (this.queryable instanceof PGlite)
      return this.queryable.transaction(async (transaction) =>
        operation(new DatabaseClient(transaction, 1)),
      );

    const pool = this.queryable as Pool;
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await operation(
        new DatabaseClient(connection as unknown as Queryable, 1),
      );
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      (connection as PoolClient).release();
    }
  }

  async close() {
    if (this.queryable instanceof PGlite) await this.queryable.close();
    else await (this.queryable as Pool).end();
  }
}

type DatabaseState = {
  key: string;
  client: DatabaseClient;
  ready: Promise<void>;
};

const globalDatabase = globalThis as typeof globalThis & {
  succeraDatabase?: DatabaseState;
};

const databaseKey = () =>
  process.env.DATABASE_URL?.trim() || `pglite:${dataDirectory()}`;

function validateDatabaseEnvironment() {
  validateAppEnvironment();
  const configured = process.env.DATABASE_URL?.trim();
  const targetsProduction = configured
    ? databaseUrlTargetsProject(configured, PRODUCTION_PROJECT_REF)
    : false;
  if (isProduction()) {
    if (!configured) throw new Error("DATABASE_URL is required in production.");
    if (!targetsProduction)
      throw new Error(
        "Production DATABASE_URL must target Succera Production (Canada Central).",
      );
  }
  if (!isProduction() && targetsProduction)
    throw new Error(
      "Succera Production cannot be used by development, staging, or tests.",
    );
}

async function applyLocalMigrations(database: DatabaseClient) {
  await database.exec(`create table if not exists public.succera_local_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  const applied = new Set(
    (
      await database
        .prepare("select name from public.succera_local_migrations")
        .all<{ name: string }>()
    ).map(({ name }) => name),
  );
  const files = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationDirectory, file), "utf8");
    await database.transaction(async (transaction) => {
      await transaction.exec(sql);
      await transaction
        .prepare("insert into public.succera_local_migrations(name) values(?)")
        .run(file);
    });
  }
}

async function initialize(database: DatabaseClient, embedded: boolean) {
  if (embedded) {
    await applyLocalMigrations(database);
    if (isDemoAllowed()) await seed(database, dataDirectory());
    await ensureInitialMatchBackfill(database);
    await ensureBuyerFunnelBackfill(database);
    await ensureTransactionAttributionBackfill(database);
    return;
  }
  if (isProduction() && isDemoAllowed())
    throw new Error("Demo data is not permitted in production.");
}

function createDatabaseState(): DatabaseState {
  validateDatabaseEnvironment();
  const configured = process.env.DATABASE_URL?.trim();
  const embedded = !configured || configured.startsWith("pglite:");
  let queryable: Queryable;
  if (embedded) {
    mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
    const memory = configured === "pglite::memory:";
    const location = memory
      ? undefined
      : path.join(dataDirectory(), "postgres");
    queryable = new PGlite(location);
  } else {
    const poolMax = Number(process.env.DATABASE_POOL_MAX || 10);
    if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 100)
      throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 100.");
    pgTypes.setTypeParser(20, (value) => Number(value));
    pgTypes.setTypeParser(1184, (value) => value);
    queryable = new Pool({
      connectionString: configured,
      max: poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  const client = new DatabaseClient(queryable);
  return {
    key: databaseKey(),
    client,
    ready: initialize(client, embedded),
  };
}

export function db() {
  const key = databaseKey();
  if (
    !globalDatabase.succeraDatabase ||
    globalDatabase.succeraDatabase.key !== key
  )
    globalDatabase.succeraDatabase = createDatabaseState();
  return globalDatabase.succeraDatabase.client;
}

export async function databaseReady() {
  db();
  await globalDatabase.succeraDatabase?.ready;
}

export function all<T>(sql: string, ...params: DatabaseValue[]): AsyncRows<T> {
  return new AsyncRows(
    databaseReady().then(() =>
      db()
        .prepare(sql)
        .all<T>(...params),
    ),
  );
}

export async function one<T>(
  sql: string,
  ...params: DatabaseValue[]
): Promise<T | undefined> {
  await databaseReady();
  return db()
    .prepare(sql)
    .get<T>(...params);
}

export async function run(
  sql: string,
  ...params: DatabaseValue[]
): Promise<RunResult> {
  await databaseReady();
  return db()
    .prepare(sql)
    .run(...params);
}

export async function closeDatabase() {
  const state = globalDatabase.succeraDatabase;
  if (!state) return;
  await state.ready.catch(() => undefined);
  await state.client.close();
  delete globalDatabase.succeraDatabase;
}
