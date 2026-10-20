import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, databaseReady, one } from "../src/lib/db";
import { mutate } from "../src/lib/service";
import type { Deal, User } from "../src/lib/types";
import { pilotCapabilities } from "../src/lib/pilot-capabilities";

let directory: string;
let owner: User;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-pilot-mvp-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  await databaseReady();
  owner = (await one<User>("SELECT * FROM users WHERE id='demo-owner'"))!;
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("pilot capabilities fail closed for deferred integrations", () => {
  assert.deepEqual(pilotCapabilities, {
    externalTeaserSafety: false,
    electronicSignatures: false,
    publicNetwork: false,
    publicTransactionPublishing: false,
  });
});

test("a private mandate draft preserves unknown optional values and cannot be shared", async () => {
  const created = await mutate(owner, {
    action: "createDeal",
    data: {
      company_name: "Pilot Draft Company Inc.",
      sector: "Business services",
      province: "Ontario",
      description:
        "A recurring-revenue Canadian business services company preparing for a confidential ownership transition.",
    },
  });
  assert.ok(created.id);

  const draft = await one<Deal>("SELECT * FROM deals WHERE id=?", created.id);
  assert.equal(draft?.published, 0);
  assert.equal(draft?.revenue, null);
  assert.equal(draft?.ebitda, null);
  assert.equal(draft?.asking_price, null);
  assert.equal(draft?.employees, null);
  assert.equal(draft?.founded, null);
  assert.equal(draft?.city, null);
  assert.equal(draft?.title, "Private mandate");
  assert.deepEqual(
    await one<{ count: number }>(
      "SELECT COUNT(*) count FROM deal_financials WHERE deal_id=?",
      created.id,
    ),
    { count: 0 },
  );

  await assert.rejects(
    mutate(owner, {
      action: "updateDeal",
      data: {
        deal_id: created.id,
        stage: "On market",
        published: true,
        distribution_mode: "qualified_discovery",
      },
    }),
    /Complete before sharing.*project name.*annual revenue/i,
  );
});
