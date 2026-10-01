import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seed } from "./seed";
import { runMigrations } from "./migrations";
import {
  ensureInitialMatchBackfill,
  recalculateBuyerProjectMatches,
} from "./match-store";
import { ensureBuyerFunnelBackfill } from "./buyer-funnel";
import { ensureTransactionAttributionBackfill } from "./transaction-attribution";
import {
  isDemoAllowed,
  isProduction,
  validateAppEnvironment,
} from "./app-environment";

export const dataDirectory = () =>
  path.resolve(process.env.DATA_DIR || "./data");
const globalDb = globalThis as unknown as { northlaneDb?: DatabaseSync };
const demoProjectFingerprint = (database: DatabaseSync, projectId: string) =>
  JSON.stringify(
    database
      .prepare(
        `SELECT name,status,thesis,min_revenue,max_revenue,min_ebitda,max_ebitda,
           min_enterprise_value,max_enterprise_value,ownership_preference,transaction_type
         FROM buyer_projects WHERE id=?`,
      )
      .get(projectId) ?? null,
  );

const assertProductionDatabaseIsClean = (database: DatabaseSync) => {
  if (!isProduction()) return;
  const hasUsers = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsers) return;
  const hasDemoColumn = database
    .prepare("PRAGMA table_info(users)")
    .all()
    .some(({ name }) => name === "is_demo");
  if (!hasDemoColumn) return;
  const demoUsers = database
    .prepare("SELECT COUNT(*) count FROM users WHERE is_demo=1")
    .get() as { count: number };
  if (demoUsers.count > 0)
    throw new Error(
      "Production DATA_DIR contains demo users. Refusing to start; verify the production volume before retrying.",
    );
};

export function db() {
  if (globalDb.northlaneDb) return globalDb.northlaneDb;
  validateAppEnvironment();
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(path.join(dataDirectory(), "northlane.sqlite"));
  try {
    assertProductionDatabaseIsClean(d);
    d.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
    );
    runMigrations(d);
    assertProductionDatabaseIsClean(d);
    const demoProjectIds = [
      "buyer-project-maple",
      "buyer-project-northern-lights",
    ];
    const demoEnabled = isDemoAllowed();
    const demoFingerprints = demoEnabled
      ? new Map(
          demoProjectIds.map((projectId) => [
            projectId,
            demoProjectFingerprint(d, projectId),
          ]),
        )
      : new Map<string, string>();
    if (demoEnabled) seed(d, dataDirectory());
    ensureInitialMatchBackfill(d);
    ensureBuyerFunnelBackfill(d);
    ensureTransactionAttributionBackfill(d);
    for (const projectId of demoProjectIds)
      if (
        demoFingerprints.has(projectId) &&
        demoFingerprints.get(projectId) !== demoProjectFingerprint(d, projectId)
      )
        recalculateBuyerProjectMatches(d, projectId);
    globalDb.northlaneDb = d;
    return d;
  } catch (error) {
    d.close();
    throw error;
  }
}
export function all<T>(
  sql: string,
  ...params: (string | number | null)[]
): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as unknown as T[];
}
export function one<T>(
  sql: string,
  ...params: (string | number | null)[]
): T | undefined {
  const row = db()
    .prepare(sql)
    .get(...params);
  return row ? ({ ...row } as T) : undefined;
}
export function run(sql: string, ...params: (string | number | null)[]) {
  return db()
    .prepare(sql)
    .run(...params);
}
