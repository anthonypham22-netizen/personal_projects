import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getAppEnvironment,
  isDemoAllowed,
  isProduction,
  isStaging,
  validateAppEnvironment,
} from "../src/lib/app-environment";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("explicit application environments drive environment classification", () => {
  assert.equal(getAppEnvironment({ APP_ENV: "development" }), "development");
  assert.equal(getAppEnvironment({ APP_ENV: "staging" }), "staging");
  assert.equal(getAppEnvironment({ APP_ENV: "production" }), "production");
  assert.equal(isStaging({ APP_ENV: "staging" }), true);
  assert.equal(isProduction({ APP_ENV: "production" }), true);
});

test("legacy localhost configuration remains a development environment", () => {
  assert.equal(
    getAppEnvironment({
      NODE_ENV: "production",
      APP_URL: "http://localhost:3000",
    }),
    "development",
  );
  assert.equal(
    getAppEnvironment({ NODE_ENV: "test", APP_URL: "https://example.test" }),
    "development",
  );
});

test("demo mode is available only outside production", () => {
  assert.equal(
    isDemoAllowed({ APP_ENV: "development", ALLOW_DEMO: "true" }),
    true,
  );
  assert.equal(isDemoAllowed({ APP_ENV: "staging", ALLOW_DEMO: "true" }), true);
  assert.equal(
    isDemoAllowed({ APP_ENV: "production", ALLOW_DEMO: "true" }),
    false,
  );
  assert.equal(
    isDemoAllowed({
      APP_ENV: "staging",
      APP_URL: "https://succera.io",
      ALLOW_DEMO: "true",
    }),
    false,
  );
});

test("production configuration rejects unsafe demo and transport settings", () => {
  assert.throws(
    () =>
      validateAppEnvironment({
        APP_ENV: "production",
        APP_URL: "https://succera.io",
        ALLOW_DEMO: "true",
        COOKIE_SECURE: "true",
      }),
    /ALLOW_DEMO must be false/,
  );
  assert.throws(
    () =>
      validateAppEnvironment({
        APP_ENV: "staging",
        APP_URL: "https://succera.io",
        ALLOW_DEMO: "false",
        COOKIE_SECURE: "true",
      }),
    /succera\.io production URL requires APP_ENV=production/,
  );
  assert.throws(
    () =>
      validateAppEnvironment({
        APP_ENV: "production",
        APP_URL: "https://succera.io",
        ALLOW_DEMO: "false",
        COOKIE_SECURE: "false",
      }),
    /COOKIE_SECURE must be true/,
  );
  assert.throws(
    () => validateAppEnvironment({ APP_ENV: "preview" }),
    /APP_ENV must be one of/,
  );
});

const runDatabaseProbe = (
  environment: Record<string, string>,
  source: string,
) =>
  spawnSync(process.execPath, ["--import", "tsx", "--eval", source], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });

test("isolated local Postgres starts empty while registration and login work", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-local-postgres-"));
  try {
    const result = runDatabaseProbe(
      {
        APP_ENV: "development",
        APP_URL: "http://127.0.0.1:3000",
        ALLOW_DEMO: "false",
        ALLOW_REGISTRATION: "true",
        COOKIE_SECURE: "false",
        DATA_DIR: directory,
        DATABASE_URL: "pglite::memory:",
        NODE_ENV: "test",
      },
      `
        const { closeDatabase, one } = await import("./src/lib/db.ts");
        const { login, register, sessionUser } = await import("./src/lib/service.ts");
        const initial = {
          users: (await one("SELECT COUNT(*) count FROM users")).count,
          demoUsers: (await one("SELECT COUNT(*) count FROM users WHERE is_demo=1")).count,
          deals: (await one("SELECT COUNT(*) count FROM deals")).count,
          documents: (await one("SELECT COUNT(*) count FROM documents")).count,
        };
        await register({ name: "Local Owner", company: "Test Company", email: "owner@example.test", password: "production-password-2026", role: "owner" });
        const token = await login({ email: "owner@example.test", password: "production-password-2026" });
        console.log(JSON.stringify({ initial, authenticated: Boolean(await sessionUser(token)) }));
        await closeDatabase();
      `,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      initial: { users: 0, demoUsers: 0, deals: 0, documents: 0 },
      authenticated: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("staging initializes the isolated synthetic marketplace", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-staging-"));
  try {
    const result = runDatabaseProbe(
      {
        APP_ENV: "staging",
        APP_URL: "https://staging.succera.io",
        ALLOW_DEMO: "true",
        ALLOW_REGISTRATION: "true",
        COOKIE_SECURE: "true",
        DATA_DIR: directory,
        DATABASE_URL: "pglite::memory:",
        NODE_ENV: "production",
      },
      `
        const { closeDatabase, one } = await import("./src/lib/db.ts");
        console.log(JSON.stringify({
          demoUsers: (await one("SELECT COUNT(*) count FROM users WHERE is_demo=1")).count,
          deals: (await one("SELECT COUNT(*) count FROM deals")).count,
          documents: (await one("SELECT COUNT(*) count FROM documents")).count,
        }));
        await closeDatabase();
      `,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      demoUsers: 5,
      deals: 6,
      documents: 6,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production requires the Canada Central Supabase database", () => {
  const base = {
    APP_ENV: "production",
    APP_URL: "https://succera.io",
    ALLOW_DEMO: "false",
    COOKIE_SECURE: "true",
    NODE_ENV: "production",
  };
  const missing = runDatabaseProbe(
    { ...base, DATABASE_URL: "" },
    `const { db } = await import("./src/lib/db.ts"); db();`,
  );
  assert.notEqual(missing.status, 0);
  assert.match(
    `${missing.stdout}\n${missing.stderr}`,
    /DATABASE_URL is required/,
  );

  const wrongProject = runDatabaseProbe(
    {
      ...base,
      DATABASE_URL:
        "postgresql://postgres:secret@db.oldproject.supabase.co:5432/postgres",
    },
    `const { db } = await import("./src/lib/db.ts"); db();`,
  );
  assert.notEqual(wrongProject.status, 0);
  assert.match(
    `${wrongProject.stdout}\n${wrongProject.stderr}`,
    /must target Succera Production \(Canada Central\)/,
  );

  const unsafeDevelopmentTarget = runDatabaseProbe(
    {
      APP_ENV: "development",
      APP_URL: "http://localhost:3000",
      ALLOW_DEMO: "false",
      COOKIE_SECURE: "false",
      NODE_ENV: "test",
      DATABASE_URL:
        "postgresql://postgres:secret@db.vtfzevaizyvgmynnyxsb.supabase.co:5432/postgres",
    },
    `const { db } = await import("./src/lib/db.ts"); db();`,
  );
  assert.notEqual(unsafeDevelopmentTarget.status, 0);
  assert.match(
    `${unsafeDevelopmentTarget.stdout}\n${unsafeDevelopmentTarget.stderr}`,
    /cannot be used by development, staging, or tests/,
  );
});

test("production demo authentication requests are rejected", async () => {
  const previous = {
    APP_ENV: process.env.APP_ENV,
    APP_URL: process.env.APP_URL,
    ALLOW_DEMO: process.env.ALLOW_DEMO,
    COOKIE_SECURE: process.env.COOKIE_SECURE,
  };
  Object.assign(process.env, {
    APP_ENV: "production",
    APP_URL: "https://succera.io",
    ALLOW_DEMO: "true",
    COOKIE_SECURE: "true",
  });
  try {
    const { POST } = await import("../src/app/api/auth/route");
    const response = await POST(
      new Request("https://succera.io/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://succera.io",
        },
        body: JSON.stringify({ action: "demo", role: "owner" }),
      }),
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "Demonstration accounts are disabled.",
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
