import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentBanner } from "../src/components/environment-banner";

test("only staging renders the persistent fictional-data warning", () => {
  const staging = EnvironmentBanner({ environment: "staging" });
  assert.equal(staging?.props.children, "STAGING — FICTIONAL DATA");
  assert.equal(EnvironmentBanner({ environment: "production" }), null);
  assert.equal(EnvironmentBanner({ environment: "development" }), null);
});
