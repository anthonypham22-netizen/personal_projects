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

test("production starts empty while normal registration and login still work", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-production-"));
  try {
    const result = runDatabaseProbe(
      {
        APP_ENV: "production",
        APP_URL: "https://succera.io",
        ALLOW_DEMO: "false",
        ALLOW_REGISTRATION: "true",
        COOKIE_SECURE: "true",
        DATA_DIR: directory,
        NODE_ENV: "production",
      },
      `
        const { db } = await import("./src/lib/db.ts");
        const { login, register, sessionUser } = await import("./src/lib/service.ts");
        const database = db();
        const initial = {
          users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
          demoUsers: database.prepare("SELECT COUNT(*) count FROM users WHERE is_demo=1").get().count,
          deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
          documents: database.prepare("SELECT COUNT(*) count FROM documents").get().count,
        };
        register({ name: "Production Owner", company: "Real Company", email: "owner@example.test", password: "production-password-2026", role: "owner" });
        const token = login({ email: "owner@example.test", password: "production-password-2026" });
        console.log(JSON.stringify({ initial, authenticated: Boolean(sessionUser(token)) }));
        database.close();
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
        NODE_ENV: "production",
      },
      `
        const { db } = await import("./src/lib/db.ts");
        const database = db();
        console.log(JSON.stringify({
          demoUsers: database.prepare("SELECT COUNT(*) count FROM users WHERE is_demo=1").get().count,
          deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
          documents: database.prepare("SELECT COUNT(*) count FROM documents").get().count,
        }));
        database.close();
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

test("production refuses a data directory that contains staging demo users", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-mixed-data-"));
  try {
    const staging = runDatabaseProbe(
      {
        APP_ENV: "staging",
        APP_URL: "https://staging.succera.io",
        ALLOW_DEMO: "true",
        COOKIE_SECURE: "true",
        DATA_DIR: directory,
        NODE_ENV: "production",
      },
      `const { db } = await import("./src/lib/db.ts"); db().close();`,
    );
    assert.equal(staging.status, 0, staging.stderr);

    const production = runDatabaseProbe(
      {
        APP_ENV: "production",
        APP_URL: "https://succera.io",
        ALLOW_DEMO: "false",
        COOKIE_SECURE: "true",
        DATA_DIR: directory,
        NODE_ENV: "production",
      },
      `const { db } = await import("./src/lib/db.ts"); db().close();`,
    );
    assert.notEqual(production.status, 0);
    assert.match(
      `${production.stdout}\n${production.stderr}`,
      /Production DATA_DIR contains demo users/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
