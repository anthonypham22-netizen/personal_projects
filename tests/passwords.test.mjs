import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, tokenHash } from "../src/lib/passwords.ts";

test("password hashes are salted and verify only the exact password", () => {
  const password = "  CanadianDealRoom!2026  ";
  const first = hashPassword(password);
  const second = hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword(password.trim(), first), false);
  assert.equal(verifyPassword("wrong-password", first), false);
  assert.equal(first.includes(password), false);
});

test("malformed hashes fail closed", () => {
  assert.equal(verifyPassword("password", ""), false);
  assert.equal(verifyPassword("password", "salt:00"), false);
});

test("stored session digests do not contain bearer tokens", () => {
  const digest = tokenHash("an-example-session-token");
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, tokenHash("an-example-session-token"));
  assert.notEqual(digest, tokenHash("another-token"));
});
