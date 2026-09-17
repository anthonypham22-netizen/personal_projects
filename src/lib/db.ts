import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seed } from "./seed";

export const dataDirectory = () => path.resolve(process.env.DATA_DIR || "./data");
const globalDb = globalThis as unknown as { northlaneDb?: DatabaseSync };
export function db() {
  if (globalDb.northlaneDb) return globalDb.northlaneDb;
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(path.join(dataDirectory(), "northlane.sqlite"));
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, company TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('buyer','owner','advisor')), province TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', sectors TEXT NOT NULL DEFAULT '', min_revenue INTEGER NOT NULL DEFAULT 1000000, max_revenue INTEGER NOT NULL DEFAULT 20000000, is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS deals (id TEXT PRIMARY KEY, title TEXT NOT NULL, company_name TEXT NOT NULL, sector TEXT NOT NULL, province TEXT NOT NULL, city TEXT NOT NULL, revenue INTEGER NOT NULL, ebitda INTEGER NOT NULL, asking_price INTEGER NOT NULL, employees INTEGER NOT NULL, founded INTEGER NOT NULL, description TEXT NOT NULL, confidential_summary TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), advisor_id TEXT REFERENCES users(id), stage TEXT NOT NULL DEFAULT 'Preparation', published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS access (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), buyer_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'requested', nda_status TEXT NOT NULL DEFAULT 'not_requested', nda_document_id TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(deal_id,buyer_id));
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), name TEXT NOT NULL, storage_key TEXT NOT NULL, mime TEXT NOT NULL, category TEXT NOT NULL, size INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, audience TEXT NOT NULL CHECK(audience IN ('team','approved','buyer')), buyer_id TEXT REFERENCES users(id), uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), buyer_id TEXT NOT NULL REFERENCES users(id), sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), title TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', buyer_id TEXT REFERENCES users(id), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), buyer_id TEXT NOT NULL REFERENCES users(id), amount INTEGER NOT NULL, structure TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Submitted', document_id TEXT NOT NULL REFERENCES documents(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_access_buyer ON access(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_docs_deal ON documents(deal_id);
    CREATE INDEX IF NOT EXISTS idx_messages_deal ON messages(deal_id,buyer_id);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id,advisor_id);
  `);
  globalDb.northlaneDb = d;
  if (process.env.ALLOW_DEMO === "true") seed(d, dataDirectory());
  return d;
}
export function all<T>(sql: string, ...params: (string | number | null)[]): T[] { return db().prepare(sql).all(...params).map(row=>({...row})) as unknown as T[]; }
export function one<T>(sql: string, ...params: (string | number | null)[]): T | undefined { const row=db().prepare(sql).get(...params);return row?({...row} as T):undefined; }
export function run(sql: string, ...params: (string | number | null)[]) { return db().prepare(sql).run(...params); }
