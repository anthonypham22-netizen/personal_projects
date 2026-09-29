import test from "node:test";
import assert from "node:assert/strict";
import {
  qualifiedDiscoveryMinimumVerificationStatus,
  verificationStatusMeets,
} from "../src/lib/verification";

const originalMinimum = process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;

test.afterEach(() => {
  if (originalMinimum === undefined)
    delete process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;
  else
    process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS = originalMinimum;
});

test("verification states use the planned trust ordering", () => {
  assert.equal(verificationStatusMeets("unverified", "firm_verified"), false);
  assert.equal(
    verificationStatusMeets("email_verified", "firm_verified"),
    false,
  );
  assert.equal(verificationStatusMeets("firm_verified", "firm_verified"), true);
  assert.equal(
    verificationStatusMeets("capital_reviewed", "firm_verified"),
    true,
  );
  assert.equal(
    verificationStatusMeets("verified_acquirer", "firm_verified"),
    true,
  );
  assert.equal(verificationStatusMeets("rejected", "unverified"), false);
  assert.equal(verificationStatusMeets("unverified", "rejected"), false);
  assert.equal(verificationStatusMeets("firm_verified", "rejected"), false);
});

test("Qualified Discovery defaults to firm verification and accepts a safe override", () => {
  delete process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;
  assert.equal(qualifiedDiscoveryMinimumVerificationStatus(), "firm_verified");

  process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS = "capital_reviewed";
  assert.equal(
    qualifiedDiscoveryMinimumVerificationStatus(),
    "capital_reviewed",
  );

  process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS = "not-a-state";
  assert.equal(qualifiedDiscoveryMinimumVerificationStatus(), "firm_verified");

  process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS = "rejected";
  assert.equal(qualifiedDiscoveryMinimumVerificationStatus(), "firm_verified");
});
