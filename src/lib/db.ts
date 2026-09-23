import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seed } from "./seed";
import { runMigrations } from "./migrations";

export const dataDirectory = () => path.resolve(process.env.DATA_DIR || "./data");
const globalDb = globalThis as unknown as { northlaneDb?: DatabaseSync };
export function db() {
  if (globalDb.northlaneDb) return globalDb.northlaneDb;
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(path.join(dataDirectory(), "northlane.sqlite"));
  try {
    d.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
    );
    runMigrations(d);
    if (process.env.ALLOW_DEMO === "true") seed(d, dataDirectory());
    globalDb.northlaneDb = d;
    return d;
  } catch (error) {
    d.close();
    throw error;
  }
}
export function all<T>(sql: string, ...params: (string | number | null)[]): T[] { return db().prepare(sql).all(...params).map(row=>({...row})) as unknown as T[]; }
export function one<T>(sql: string, ...params: (string | number | null)[]): T | undefined { const row=db().prepare(sql).get(...params);return row?({...row} as T):undefined; }
export function run(sql: string, ...params: (string | number | null)[]) { return db().prepare(sql).run(...params); }
