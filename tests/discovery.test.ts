import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUALIFIED_DISCOVERY_MIN_SCORE,
  qualifiedDiscoveryMinimumScore,
} from "../src/lib/discovery";

const original = process.env.QUALIFIED_DISCOVERY_MIN_SCORE;

afterEach(() => {
  if (original === undefined) delete process.env.QUALIFIED_DISCOVERY_MIN_SCORE;
  else process.env.QUALIFIED_DISCOVERY_MIN_SCORE = original;
});

test("qualified discovery defaults to a 70 percent minimum score", () => {
  delete process.env.QUALIFIED_DISCOVERY_MIN_SCORE;
  assert.equal(DEFAULT_QUALIFIED_DISCOVERY_MIN_SCORE, 70);
  assert.equal(qualifiedDiscoveryMinimumScore(), 70);
});

test("qualified discovery accepts only configured scores from 0 through 100", () => {
  process.env.QUALIFIED_DISCOVERY_MIN_SCORE = "82";
  assert.equal(qualifiedDiscoveryMinimumScore(), 82);
  for (const invalid of ["-1", "101", "not-a-number", ""])
    ((process.env.QUALIFIED_DISCOVERY_MIN_SCORE = invalid),
      assert.equal(qualifiedDiscoveryMinimumScore(), 70));
});
