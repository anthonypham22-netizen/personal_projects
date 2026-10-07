import "server-only";

import { rmSync } from "node:fs";
import path from "node:path";
import { closeDatabase, databaseReady, run } from "../src/lib/db";
import { register, sessionUser } from "../src/lib/service";
import {
  E2E_PLATFORM_ADMIN_EMAIL,
  E2E_PLATFORM_ADMIN_PASSWORD,
} from "../e2e/platform-admin-fixture";

const dataDirectory = path.resolve("test-results/app-data");

async function main() {
  rmSync(dataDirectory, { recursive: true, force: true });
  process.env.APP_ENV = "development";
  process.env.DATABASE_URL = "pglite:e2e";
  process.env.DATA_DIR = dataDirectory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";

  await databaseReady();
  const token = await register({
    name: "Verification Operations Reviewer",
    company: "Succera Platform Operations",
    email: E2E_PLATFORM_ADMIN_EMAIL,
    password: E2E_PLATFORM_ADMIN_PASSWORD,
    role: "advisor",
  });
  const reviewer = await sessionUser(token);
  if (!reviewer) throw new Error("Unable to create the E2E platform reviewer.");
  await run("UPDATE users SET is_platform_admin=1 WHERE id=?", reviewer.id);
  await closeDatabase();
}

void main();
