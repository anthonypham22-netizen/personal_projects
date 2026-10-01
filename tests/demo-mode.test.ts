import assert from "node:assert/strict";
import test from "node:test";
import { isRolePreviewEnabled } from "../src/lib/demo-mode";

test("role preview requires a non-production environment and the demo flag", () => {
  assert.equal(
    isRolePreviewEnabled({ NODE_ENV: "development", ALLOW_DEMO: "true" }),
    true,
  );
  assert.equal(
    isRolePreviewEnabled({ NODE_ENV: "test", ALLOW_DEMO: "true" }),
    true,
  );
  assert.equal(
    isRolePreviewEnabled({ NODE_ENV: "production", ALLOW_DEMO: "true" }),
    false,
  );
  assert.equal(
    isRolePreviewEnabled({ NODE_ENV: "development", ALLOW_DEMO: "false" }),
    false,
  );
  assert.equal(isRolePreviewEnabled({ NODE_ENV: "development" }), false);
});
