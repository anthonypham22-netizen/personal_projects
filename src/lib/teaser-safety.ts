import { createHash } from "node:crypto";
import { z } from "zod";

export const TEASER_SAFETY_FINDING_TYPES = [
  "company_name",
  "domain",
  "customer_name",
  "precise_location",
  "revealing_detail",
  "missing_financial",
] as const;
export type TeaserSafetyFindingType =
  (typeof TEASER_SAFETY_FINDING_TYPES)[number];

export const TEASER_SAFETY_SEVERITIES = ["high", "medium", "low"] as const;
export type TeaserSafetySeverity = (typeof TEASER_SAFETY_SEVERITIES)[number];

export type TeaserSafetyFinding = {
  type: TeaserSafetyFindingType;
  severity: TeaserSafetySeverity;
  evidence: string;
  message: string;
  replacement: string;
};

export const TEASER_SAFETY_LIMITS = Object.freeze({
  findings: 20,
  highlights: 8,
  missingFinancials: 12,
  teaser: 1200,
  evidence: 200,
  message: 400,
  replacement: 300,
});

export type TeaserSafetyReviewInput = {
  companyName: string;
  sector: string;
  province: string;
  city: string;
  revenue: number;
  ebitda: number;
  askingPrice: number;
  employees: number;
  founded: number;
  transactionType: string;
  ownershipPercentageAvailable: number;
  sellerRolloverPossible: boolean;
  description: string;
  historicalFinancialPeriods: number;
};

export type TeaserSafetyProviderOutput = {
  findings: TeaserSafetyFinding[];
  suggestedTeaser: string;
  investmentHighlights: string[];
  missingFinancials: string[];
};

export type TeaserSafetyProvider = {
  id: string;
  displayName: string;
  externalDataProcessing: boolean;
  review(input: {
    teaser: string;
    sector: string;
    province: string;
    revenueBand: string | null;
    ebitdaBand: string | null;
    transactionType: string;
    ownershipPercentageAvailable: number;
  }): Promise<TeaserSafetyProviderOutput>;
};

export type TeaserSafetyAnalysis = TeaserSafetyProviderOutput & {
  status: "ready" | "attention" | "high_risk";
  provider: string;
  providerName: string;
  externalDataProcessing: boolean;
  inputSha256: string;
};

export const teaserSafetyProviderOutputSchema = z.object({
  findings: z
    .array(
      z.object({
        type: z.enum(TEASER_SAFETY_FINDING_TYPES),
        severity: z.enum(TEASER_SAFETY_SEVERITIES),
        evidence: z.string().trim().max(TEASER_SAFETY_LIMITS.evidence),
        message: z.string().trim().min(1).max(TEASER_SAFETY_LIMITS.message),
        replacement: z.string().trim().max(TEASER_SAFETY_LIMITS.replacement),
      }),
    )
    .max(TEASER_SAFETY_LIMITS.findings),
  suggestedTeaser: z.string().trim().max(TEASER_SAFETY_LIMITS.teaser),
  investmentHighlights: z
    .array(z.string().trim().min(1).max(TEASER_SAFETY_LIMITS.replacement))
    .max(TEASER_SAFETY_LIMITS.highlights),
  missingFinancials: z
    .array(z.string().trim().min(1).max(TEASER_SAFETY_LIMITS.evidence))
    .max(TEASER_SAFETY_LIMITS.missingFinancials),
});

export const teaserContentDigest = (description: string) =>
  createHash("sha256").update(description, "utf8").digest("hex");

export const teaserSafetyReviewInputDigest = (input: TeaserSafetyReviewInput) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        input.companyName,
        input.sector,
        input.province,
        input.city,
        input.revenue,
        input.ebitda,
        input.askingPrice,
        input.employees,
        input.founded,
        input.transactionType,
        input.ownershipPercentageAvailable,
        input.sellerRolloverPossible,
        input.description,
        input.historicalFinancialPeriods,
      ]),
      "utf8",
    )
    .digest("hex");

const normalized = (value: string) => value.trim().toLocaleLowerCase("en-CA");
const unique = (values: string[]) => [
  ...new Map(values.map((value) => [normalized(value), value.trim()])).values(),
];
const clipped = (value: string, maximum = 180) =>
  value.trim().replace(/\s+/g, " ").slice(0, maximum);

const addFinding = (
  findings: TeaserSafetyFinding[],
  finding: TeaserSafetyFinding,
) => {
  const key = `${finding.type}:${normalized(finding.evidence)}`;
  if (
    findings.some(
      (current) => `${current.type}:${normalized(current.evidence)}` === key,
    )
  )
    return;
  findings.push({
    ...finding,
    evidence: clipped(finding.evidence),
    message: clipped(finding.message, 400),
    replacement: clipped(finding.replacement, 300),
  });
};

const entityPattern =
  /\b([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){0,5}\s+(?:Inc\.?|Incorporated|Ltd\.?|Limited|Corp\.?|Corporation|Company|Group|Holdings|Partners|LLP|LP))\b/g;
const domainPattern =
  /\b(?:(?:https?:\/\/|www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:ca|com|net|org|io|co)(?:\/[^\s]*)?)/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const postalCodePattern =
  /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi;
const streetPattern =
  /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'’ -]{1,60}\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Way)\b/gi;
const customerPattern =
  /\b(?:(?:[Cc]ustomers?|[Cc]lients?|[Aa]ccounts?)\s*(?::|[—-]|[Ii]ncludes?|[Ii]ncluding|[Ss]uch as|[Nn]amed)?|[Ss]erves?|[Ss]erving|[Ii]ncluding|[Ss]uch as)\s+(?:[Nn]amed\s+)?([A-Z][A-Za-z0-9&'’-]+(?:\s+[A-Z][A-Za-z0-9&'’-]+){0,4})/g;

export function deterministicTeaserFindings(
  input: TeaserSafetyReviewInput,
  text = input.description,
) {
  const findings: TeaserSafetyFinding[] = [];
  const lowerText = normalized(text);
  const legalName = input.companyName.trim();
  if (legalName && lowerText.includes(normalized(legalName)))
    addFinding(findings, {
      type: "company_name",
      severity: "high",
      evidence: legalName,
      message: "The legal company name identifies the business.",
      replacement: "the company",
    });
  const businessName = legalName
    .replace(
      /\s+(?:Inc\.?|Incorporated|Ltd\.?|Limited|Corp\.?|Corporation|Company|Group|Holdings|Partners|LLP|LP)$/i,
      "",
    )
    .trim();
  if (
    businessName.length >= 4 &&
    normalized(businessName) !== normalized(legalName) &&
    lowerText.includes(normalized(businessName))
  )
    addFinding(findings, {
      type: "company_name",
      severity: "high",
      evidence: businessName,
      message:
        "A distinctive trading or business name identifies the opportunity.",
      replacement: "the company",
    });

  for (const match of text.matchAll(entityPattern))
    addFinding(findings, {
      type: "company_name",
      severity: "high",
      evidence: match[1],
      message: "A named business or legal entity may identify the opportunity.",
      replacement: "a Canadian business",
    });

  for (const match of [
    ...text.matchAll(domainPattern),
    ...text.matchAll(emailPattern),
  ])
    addFinding(findings, {
      type: "domain",
      severity: "high",
      evidence: match[0],
      message:
        "Websites and email addresses can reveal the business or its people.",
      replacement: "",
    });

  for (const match of text.matchAll(customerPattern)) {
    const evidence = match[1]?.trim();
    if (
      !evidence ||
      /^(customers?|clients?|businesses?|organizations?)$/i.test(evidence)
    )
      continue;
    addFinding(findings, {
      type: "customer_name",
      severity: "high",
      evidence,
      message: "A named customer or account may identify the company.",
      replacement: "a diversified customer base",
    });
  }

  const city = input.city.trim();
  if (city && lowerText.includes(normalized(city)))
    addFinding(findings, {
      type: "precise_location",
      severity: "medium",
      evidence: city,
      message:
        "A city may be too precise for a narrow industry or local market.",
      replacement: input.province,
    });
  for (const match of [
    ...text.matchAll(postalCodePattern),
    ...text.matchAll(streetPattern),
  ])
    addFinding(findings, {
      type: "precise_location",
      severity: "high",
      evidence: match[0],
      message: "A street address or postal code can identify the business.",
      replacement: input.province,
    });

  if (input.founded > 0 && new RegExp(`\\b${input.founded}\\b`).test(text))
    addFinding(findings, {
      type: "revealing_detail",
      severity: "low",
      evidence: String(input.founded),
      message:
        "An exact founding year can narrow the identity of the business.",
      replacement: "an established business",
    });
  if (
    input.employees > 0 &&
    new RegExp(
      `\\b${input.employees}\\s+(?:employees?|staff|team members?)\\b`,
      "i",
    ).test(text)
  )
    addFinding(findings, {
      type: "revealing_detail",
      severity: "low",
      evidence: `${input.employees} employees`,
      message:
        "An exact employee count can be identifying when combined with other details.",
      replacement: teamBand(input.employees),
    });
  for (const match of text.matchAll(
    /\b(?:only|sole|largest|top)\s+(?:customer|client)[^.!?]{0,80}\b\d{1,3}%/gi,
  ))
    addFinding(findings, {
      type: "revealing_detail",
      severity: "medium",
      evidence: match[0],
      message:
        "A precise customer-concentration statement may reveal the company.",
      replacement: "a diversified customer base",
    });
  return findings;
}

const revenueBand = (amount: number) => {
  if (amount <= 0) return null;
  if (amount < 1_000_000) return "under C$1M";
  if (amount < 2_000_000) return "C$1M–C$2M";
  if (amount < 5_000_000) return "C$2M–C$5M";
  if (amount < 10_000_000) return "C$5M–C$10M";
  if (amount < 20_000_000) return "C$10M–C$20M";
  return "over C$20M";
};

const ebitdaBand = (amount: number) => {
  if (amount <= 0) return null;
  if (amount < 500_000) return "under C$500K";
  if (amount < 1_000_000) return "C$500K–C$1M";
  if (amount < 2_000_000) return "C$1M–C$2M";
  if (amount < 5_000_000) return "C$2M–C$5M";
  return "over C$5M";
};

const teamBand = (employees: number) => {
  if (employees < 10) return "a team of fewer than 10";
  if (employees < 25) return "a team of approximately 10–25";
  if (employees < 50) return "a team of approximately 25–50";
  if (employees < 100) return "a team of approximately 50–100";
  return "a team of more than 100";
};

const transactionLabel = (value: string) =>
  ({
    full_acquisition: "a full acquisition",
    majority_acquisition: "a majority investment",
    minority_investment: "a minority investment",
    add_on: "an add-on acquisition",
    recapitalization: "a recapitalization",
    other: "a flexible transaction",
  })[value] ?? "a flexible transaction";

const deterministicRewrite = (input: TeaserSafetyReviewInput) => {
  const statements = [
    `An established Canadian ${input.sector.toLocaleLowerCase("en-CA")} business serving customers across ${input.province}.`,
  ];
  const revenue = revenueBand(input.revenue);
  const ebitda = ebitdaBand(input.ebitda);
  if (revenue && ebitda)
    statements.push(
      `The company generates annual revenue in the ${revenue} range and EBITDA in the ${ebitda} range.`,
    );
  else if (revenue)
    statements.push(`Annual revenue is in the ${revenue} range.`);
  if (input.employees > 0)
    statements.push(
      `Operations are supported by ${teamBand(input.employees)} people.`,
    );
  const years = new Date().getUTCFullYear() - input.founded;
  if (input.founded > 0 && years >= 5)
    statements.push(
      `The business has more than ${Math.max(5, Math.floor(years / 5) * 5)} years of operating history.`,
    );
  statements.push(
    `The shareholders are considering ${transactionLabel(input.transactionType)} and will review fit with qualified counterparties.`,
  );
  return statements.join(" ").slice(0, TEASER_SAFETY_LIMITS.teaser);
};

const deterministicHighlights = (input: TeaserSafetyReviewInput) => {
  const highlights: string[] = [];
  const revenue = revenueBand(input.revenue);
  const ebitda = ebitdaBand(input.ebitda);
  if (revenue) highlights.push(`Annual revenue in the ${revenue} range`);
  if (ebitda) highlights.push(`EBITDA in the ${ebitda} range`);
  if (input.revenue > 0 && input.ebitda > 0)
    highlights.push(
      `Approximately ${Math.round((input.ebitda / input.revenue) * 100)}% EBITDA margin`,
    );
  const years = new Date().getUTCFullYear() - input.founded;
  if (input.founded > 0 && years >= 5)
    highlights.push(
      `More than ${Math.max(5, Math.floor(years / 5) * 5)} years of operating history`,
    );
  if (input.ownershipPercentageAvailable > 0)
    highlights.push(
      `${Math.round(input.ownershipPercentageAvailable)}% ownership potentially available`,
    );
  if (input.sellerRolloverPossible)
    highlights.push("Seller rollover may be considered");
  return highlights.slice(0, 6);
};

const deterministicMissingFinancials = (input: TeaserSafetyReviewInput) => {
  const missing: string[] = [];
  if (input.revenue <= 0) missing.push("Annual revenue");
  if (input.ebitda <= 0) missing.push("EBITDA");
  if (input.askingPrice <= 0) missing.push("Indicative valuation expectations");
  if (input.historicalFinancialPeriods <= 0)
    missing.push("Historical financial periods");
  if (
    !/\b(?:revenue|sales|ebitda|earnings|margin|profit)\b/i.test(
      input.description,
    )
  )
    missing.push("Financial scale in the teaser narrative");
  return missing;
};

const safeProviderHighlights = (
  highlights: string[],
  input: TeaserSafetyReviewInput,
) =>
  highlights.filter(
    (highlight) => deterministicTeaserFindings(input, highlight).length === 0,
  );

export async function analyzeTeaserSafety(
  input: TeaserSafetyReviewInput,
  provider: TeaserSafetyProvider,
): Promise<TeaserSafetyAnalysis> {
  const deterministicFindings = deterministicTeaserFindings(input);
  let providerOutput: TeaserSafetyProviderOutput = {
    findings: [],
    suggestedTeaser: "",
    investmentHighlights: [],
    missingFinancials: [],
  };
  let providerId = provider.id;
  let providerName = provider.displayName;
  try {
    providerOutput = teaserSafetyProviderOutputSchema.parse(
      await provider.review({
        teaser: input.description,
        sector: input.sector,
        province: input.province,
        revenueBand: revenueBand(input.revenue),
        ebitdaBand: ebitdaBand(input.ebitda),
        transactionType: input.transactionType,
        ownershipPercentageAvailable: input.ownershipPercentageAvailable,
      }),
    );
  } catch {
    providerId = `local-fallback:${provider.id}`;
    providerName = `Local deterministic fallback after ${provider.displayName} failure`;
  }
  const findings = [...deterministicFindings];
  for (const finding of providerOutput.findings) addFinding(findings, finding);
  const providerSuggestionFindings = providerOutput.suggestedTeaser
    ? deterministicTeaserFindings(input, providerOutput.suggestedTeaser)
    : [];
  const suggestedTeaser =
    providerOutput.suggestedTeaser && !providerSuggestionFindings.length
      ? providerOutput.suggestedTeaser
      : deterministicRewrite(input);
  const safeHighlights = safeProviderHighlights(
    providerOutput.investmentHighlights,
    input,
  );
  const investmentHighlights = unique([
    ...safeHighlights,
    ...deterministicHighlights(input),
  ]).slice(0, TEASER_SAFETY_LIMITS.highlights);
  const missingFinancials = unique([
    ...deterministicMissingFinancials(input),
    ...providerOutput.missingFinancials,
  ]).slice(0, TEASER_SAFETY_LIMITS.missingFinancials);
  const status = findings.some((finding) => finding.severity === "high")
    ? "high_risk"
    : findings.length || missingFinancials.length
      ? "attention"
      : "ready";
  return {
    status,
    findings,
    suggestedTeaser,
    investmentHighlights,
    missingFinancials,
    provider: providerId,
    providerName,
    externalDataProcessing: provider.externalDataProcessing,
    inputSha256: teaserSafetyReviewInputDigest(input),
  };
}
