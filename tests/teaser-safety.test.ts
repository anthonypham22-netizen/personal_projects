import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTeaserSafety,
  deterministicTeaserFindings,
  teaserContentDigest,
  teaserSafetyReviewInputDigest,
  type TeaserSafetyProvider,
  type TeaserSafetyReviewInput,
} from "../src/lib/teaser-safety";
import { configuredTeaserSafetyProvider } from "../src/lib/teaser-safety-provider";

const baseInput: TeaserSafetyReviewInput = {
  companyName: "Signal Bridge Analytics Inc.",
  sector: "Technology",
  province: "Ontario",
  city: "Kingston",
  revenue: 6_400_000,
  ebitda: 1_120_000,
  askingPrice: 8_000_000,
  employees: 37,
  founded: 2012,
  transactionType: "full_acquisition",
  ownershipPercentageAvailable: 100,
  sellerRolloverPossible: false,
  description:
    "Signal Bridge Analytics Inc. at 123 King Street in Kingston serves Acme Hospitals. Learn more at signalbridge.ca.",
  historicalFinancialPeriods: 3,
};

const provider = (
  result: Awaited<ReturnType<TeaserSafetyProvider["review"]>>,
): TeaserSafetyProvider => ({
  id: "test-provider",
  displayName: "Test provider",
  externalDataProcessing: false,
  async review() {
    return result;
  },
});

test("the safety assistant finds identifiers and rejects an unsafe provider rewrite", async () => {
  const result = await analyzeTeaserSafety(
    baseInput,
    provider({
      findings: [],
      suggestedTeaser: baseInput.description,
      investmentHighlights: ["Signal Bridge Analytics is a category leader."],
      missingFinancials: [],
    }),
  );

  const categories = new Set(result.findings.map((finding) => finding.type));
  assert.ok(categories.has("company_name"));
  assert.ok(categories.has("domain"));
  assert.ok(categories.has("customer_name"));
  assert.ok(categories.has("precise_location"));
  assert.equal(result.status, "high_risk");
  assert.doesNotMatch(result.suggestedTeaser, /Signal Bridge/i);
  assert.doesNotMatch(result.suggestedTeaser, /signalbridge\.ca/i);
  assert.doesNotMatch(result.suggestedTeaser, /Acme Hospitals/i);
  assert.doesNotMatch(result.suggestedTeaser, /Kingston|123 King/i);
  assert.ok(result.investmentHighlights.length >= 2);
  assert.ok(
    result.investmentHighlights.every(
      (highlight) => !/Signal Bridge|signalbridge\.ca/i.test(highlight),
    ),
  );
});

test("safe provider suggestions are merged with deterministic financial checks", async () => {
  const input: TeaserSafetyReviewInput = {
    ...baseInput,
    companyName: "Private Company Ltd.",
    city: "Toronto",
    description:
      "A Canadian technology services company with a diversified customer base and recurring contracts.",
    revenue: 0,
    ebitda: 0,
    askingPrice: 0,
    historicalFinancialPeriods: 0,
  };
  const result = await analyzeTeaserSafety(
    input,
    provider({
      findings: [
        {
          type: "revealing_detail",
          severity: "low",
          evidence: "recurring contracts",
          message: "Confirm this description cannot identify the company.",
          replacement: "repeat customer relationships",
        },
      ],
      suggestedTeaser:
        "A Canadian technology services company with repeat customer relationships and a diversified customer base.",
      investmentHighlights: [
        "Recurring service relationships",
        "Diversified customer base",
      ],
      missingFinancials: ["Customer concentration"],
    }),
  );

  assert.equal(result.suggestedTeaser.includes("Private Company"), false);
  assert.ok(result.missingFinancials.includes("Annual revenue"));
  assert.ok(result.missingFinancials.includes("EBITDA"));
  assert.ok(result.missingFinancials.includes("Historical financial periods"));
  assert.ok(result.missingFinancials.includes("Customer concentration"));
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.type === "revealing_detail" && finding.severity === "low",
    ),
  );
});

test("teaser review digests are stable and change with the reviewed draft", () => {
  assert.equal(
    teaserContentDigest("A private teaser"),
    teaserContentDigest("A private teaser"),
  );
  assert.notEqual(
    teaserContentDigest("A private teaser"),
    teaserContentDigest("A changed private teaser"),
  );

  assert.equal(
    teaserSafetyReviewInputDigest(baseInput),
    teaserSafetyReviewInputDigest({ ...baseInput }),
  );
  assert.notEqual(
    teaserSafetyReviewInputDigest(baseInput),
    teaserSafetyReviewInputDigest({ ...baseInput, revenue: 6_500_000 }),
  );
  assert.notEqual(
    teaserSafetyReviewInputDigest(baseInput),
    teaserSafetyReviewInputDigest({
      ...baseInput,
      historicalFinancialPeriods: 4,
    }),
  );
});

test("only historical financial periods satisfy the financial-history check", async () => {
  const projectedOnly = await analyzeTeaserSafety(
    { ...baseInput, historicalFinancialPeriods: 0 },
    provider({
      findings: [],
      suggestedTeaser: "A safely anonymized Canadian technology business.",
      investmentHighlights: [],
      missingFinancials: [],
    }),
  );
  const withHistory = await analyzeTeaserSafety(
    { ...baseInput, historicalFinancialPeriods: 1 },
    provider({
      findings: [],
      suggestedTeaser: "A safely anonymized Canadian technology business.",
      investmentHighlights: [],
      missingFinancials: [],
    }),
  );

  assert.ok(
    projectedOnly.missingFinancials.includes("Historical financial periods"),
  );
  assert.equal(
    withHistory.missingFinancials.includes("Historical financial periods"),
    false,
  );
});

test("provider failures and malformed output fall back to a deterministic local review", async () => {
  const failingProvider: TeaserSafetyProvider = {
    id: "external-test",
    displayName: "External test provider",
    externalDataProcessing: true,
    async review() {
      throw new Error("Provider unavailable");
    },
  };
  const malformedProvider: TeaserSafetyProvider = {
    ...failingProvider,
    id: "malformed-test",
    async review() {
      return { findings: "invalid" } as unknown as Awaited<
        ReturnType<TeaserSafetyProvider["review"]>
      >;
    },
  };

  const result = await analyzeTeaserSafety(baseInput, failingProvider);
  const malformedResult = await analyzeTeaserSafety(
    baseInput,
    malformedProvider,
  );

  assert.equal(result.provider, "local-fallback:external-test");
  assert.match(result.providerName, /Local deterministic fallback/i);
  assert.equal(result.externalDataProcessing, true);
  assert.equal(result.inputSha256, teaserSafetyReviewInputDigest(baseInput));
  assert.ok(result.findings.some((finding) => finding.type === "company_name"));
  assert.doesNotMatch(result.suggestedTeaser, /Signal Bridge|Acme Hospitals/i);
  assert.ok(result.investmentHighlights.length > 0);
  assert.equal(malformedResult.provider, "local-fallback:malformed-test");
  assert.equal(malformedResult.externalDataProcessing, true);
  assert.equal(malformedResult.suggestedTeaser, result.suggestedTeaser);
});

test("customer detection catches labelled and include-list customer names", () => {
  const findings = deterministicTeaserFindings(
    baseInput,
    [
      "Customer: Northstar Health",
      "Clients include Maple Ridge Grocers",
      "Customers include Acme Hospitals",
      "Account named Summit Industrial Group",
    ].join(". "),
  );
  const evidence = findings
    .filter((finding) => finding.type === "customer_name")
    .map((finding) => finding.evidence);

  assert.ok(evidence.includes("Northstar Health"));
  assert.ok(evidence.includes("Maple Ridge Grocers"));
  assert.ok(evidence.includes("Acme Hospitals"));
  assert.ok(evidence.includes("Summit Industrial Group"));
});

test("the OpenAI adapter requests non-stored structured output", async () => {
  const originalProvider = process.env.TEASER_SAFETY_PROVIDER;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_TEASER_SAFETY_MODEL;
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  try {
    process.env.TEASER_SAFETY_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.OPENAI_TEASER_SAFETY_MODEL = "test-model";
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    findings: [],
                    suggestedTeaser: "A safely anonymized Canadian business.",
                    investmentHighlights: ["Repeat customer relationships"],
                    missingFinancials: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const selected = configuredTeaserSafetyProvider();
    assert.equal(selected?.id, "openai");
    const result = await selected!.review({
      teaser: "A Canadian services business.",
      sector: "Business services",
      province: "Ontario",
      revenueBand: "C$2M–C$5M",
      ebitdaBand: "C$500K–C$1M",
      transactionType: "full_acquisition",
      ownershipPercentageAvailable: 100,
    });
    assert.equal(
      result.suggestedTeaser,
      "A safely anonymized Canadian business.",
    );
    assert.equal(requestBody?.store, false);
    assert.deepEqual(
      (requestBody?.text as { format?: { type?: string } }).format?.type,
      "json_schema",
    );
    const sentInput = JSON.parse(String(requestBody?.input)) as Record<
      string,
      unknown
    >;
    assert.deepEqual(Object.keys(sentInput).sort(), [
      "ebitdaBand",
      "ownershipPercentageAvailable",
      "province",
      "revenueBand",
      "sector",
      "teaser",
      "transactionType",
    ]);
    assert.equal("companyName" in sentInput, false);
    assert.equal("city" in sentInput, false);
    assert.equal("askingPrice" in sentInput, false);
    assert.equal("employees" in sentInput, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalProvider === undefined)
      delete process.env.TEASER_SAFETY_PROVIDER;
    else process.env.TEASER_SAFETY_PROVIDER = originalProvider;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined)
      delete process.env.OPENAI_TEASER_SAFETY_MODEL;
    else process.env.OPENAI_TEASER_SAFETY_MODEL = originalModel;
  }
});
