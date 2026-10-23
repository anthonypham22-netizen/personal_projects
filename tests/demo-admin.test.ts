import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, databaseReady, db, one, run } from "../src/lib/db";
import { seed } from "../src/lib/seed";
import {
  canAccess,
  createSession,
  getDeal,
  register,
  sessionUser,
  workspace,
} from "../src/lib/service";
import type { User } from "../src/lib/types";

let directory: string;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-demo-admin-"));
  process.env.APP_ENV = "development";
  process.env.DATA_DIR = directory;
  process.env.DATABASE_URL = "pglite::memory:";
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  await databaseReady();
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("ordinary demo identities have no platform privileges and admin has no deal access", async () => {
  for (const role of ["owner", "advisor", "buyer"]) {
    const user = (await sessionUser(await createSession(`demo-${role}`)))!;
    assert.equal(user.is_platform_admin, 0);
    assert.equal((await workspace(user)).is_platform_admin, false);
  }
  const admin = (await sessionUser(await createSession("demo-admin")))!;
  assert.equal(admin.is_demo, 1);
  assert.equal(admin.is_platform_admin, 1);
  assert.equal(
    admin.role,
    "advisor",
    "admin is a privilege, not a registration role",
  );
  const state = await workspace(admin);
  assert.equal(state.organization.id, "org-demo-admin");
  assert.equal(state.is_platform_admin, true);
  assert.deepEqual(state.deals, []);
  assert.equal(await canAccess(admin, await getDeal("cedar")), false);
});

test("re-seeding repairs old demo privileges without changing customer administrators", async () => {
  const customer = (await sessionUser(
    await register({
      name: "Customer Administrator",
      company: "Registered Firm",
      email: "registered-admin@example.test",
      password: "registered-admin-password-2026",
      role: "advisor",
    }),
  ))!;
  await run("UPDATE users SET is_platform_admin=1 WHERE id=?", customer.id);
  await run("UPDATE users SET is_platform_admin=1 WHERE id='demo-advisor'");
  await run("UPDATE users SET is_platform_admin=0 WHERE id='demo-admin'");
  const countBefore = await one<{ count: number }>(
    "SELECT COUNT(*) count FROM users",
  );

  await seed(db(), directory);
  await seed(db(), directory);

  assert.equal(
    (await one<User>("SELECT * FROM users WHERE id='demo-advisor'"))
      ?.is_platform_admin,
    0,
  );
  assert.equal(
    (await one<User>("SELECT * FROM users WHERE id='demo-admin'"))
      ?.is_platform_admin,
    1,
  );
  const customerAfter = await one<User>(
    "SELECT * FROM users WHERE id=?",
    customer.id,
  );
  assert.equal(customerAfter?.is_platform_admin, 1);
  assert.equal(customerAfter?.is_demo, 0);
  assert.deepEqual(await one("SELECT COUNT(*) count FROM users"), countBefore);
  assert.equal(
    (
      await one<{ count: number }>(
        "SELECT COUNT(*) count FROM organization_members WHERE user_id='demo-admin'",
      )
    )?.count,
    1,
  );
});
