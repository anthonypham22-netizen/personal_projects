import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seed } from "./seed";
import { runMigrations } from "./migrations";
import {
  ensureInitialMatchBackfill,
  recalculateBuyerProjectMatches,
} from "./match-store";

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
export function db() {
  if (globalDb.northlaneDb) return globalDb.northlaneDb;
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(path.join(dataDirectory(), "northlane.sqlite"));
  try {
    d.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000",
    );
    runMigrations(d);
    const demoProjectIds = [
      "buyer-project-maple",
      "buyer-project-northern-lights",
    ];
    const demoFingerprints =
      process.env.ALLOW_DEMO === "true"
        ? new Map(
            demoProjectIds.map((projectId) => [
              projectId,
              demoProjectFingerprint(d, projectId),
            ]),
          )
        : new Map<string, string>();
    if (process.env.ALLOW_DEMO === "true") seed(d, dataDirectory());
    ensureInitialMatchBackfill(d);
    for (const projectId of demoProjectIds)
      if (
        demoFingerprints.has(projectId) &&
        demoFingerprints.get(projectId) !==
          demoProjectFingerprint(d, projectId)
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
