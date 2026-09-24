import type { BuyerProject, Deal } from "./types";

export const MATCH_WEIGHTS = Object.freeze({
  industry: 25,
  revenue: 15,
  ebitda: 15,
  geography: 15,
  transaction: 10,
  enterprise_value: 10,
  ownership: 5,
  keywords: 5,
});

export const MATCHING_CONFIG = Object.freeze({
  // Enforcement remains opt-in until the product has a verification workflow.
  qualifiedDiscoveryRequiresVerification: false,
});

export type MatchDimension = keyof typeof MATCH_WEIGHTS;

export type MatchReason = {
  dimension: MatchDimension;
  score: number;
  maximum: number;
  explanation: string;
};

export type MatchResult = {
  score: number;
  eligible: boolean;
  reasons: MatchReason[];
  hard_exclusions: string[];
};

export type MatchContext = {
  buyerVerificationStatus?: string;
  buyerExplicitlyBlocked?: boolean;
  sellerExcluded?: boolean;
  requiresDiscoveryVerification?: boolean;
  marketplaceEnvironmentsMatch?: boolean;
};

const normalized = (value: string) => value.trim().toLocaleLowerCase("en-CA");

const within = (
  value: number,
  minimum: number | null,
  maximum: number | null,
) =>
  (minimum === null || value >= minimum) &&
  (maximum === null || value <= maximum);

const rangeExplanation = (
  label: string,
  value: number,
  minimum: number | null,
  maximum: number | null,
) => {
  if (minimum === null && maximum === null)
    return `${label} is unrestricted by the buyer mandate.`;
  return within(value, minimum, maximum)
    ? `${label} falls within the buyer mandate range.`
    : `${label} falls outside the buyer mandate range.`;
};

const rangeScore = (
  dimension: "revenue" | "ebitda",
  label: string,
  value: number,
  minimum: number | null,
  maximum: number | null,
  maximumScore: number,
): MatchReason => ({
  dimension,
  score: within(value, minimum, maximum) ? maximumScore : 0,
  maximum: maximumScore,
  explanation: rangeExplanation(label, value, minimum, maximum),
});

const rangesOverlap = (
  leftMinimum: number,
  leftMaximum: number,
  rightMinimum: number | null,
  rightMaximum: number | null,
) =>
  (rightMaximum === null || leftMinimum <= rightMaximum) &&
  (rightMinimum === null || leftMaximum >= rightMinimum);

function ebitdaReason(deal: Deal, project: BuyerProject): MatchReason {
  const amountRestricted =
    project.min_ebitda !== null || project.max_ebitda !== null;
  const marginRestricted =
    project.min_ebitda_margin !== null || project.max_ebitda_margin !== null;
  const amountMatches = within(
    deal.ebitda,
    project.min_ebitda,
    project.max_ebitda,
  );
  const margin = deal.revenue > 0 ? (deal.ebitda / deal.revenue) * 100 : null;
  const marginMatches =
    margin !== null &&
    within(margin, project.min_ebitda_margin, project.max_ebitda_margin);
  const checks = [
    ...(amountRestricted ? [amountMatches] : []),
    ...(marginRestricted ? [marginMatches] : []),
  ];
  const matchedChecks = checks.filter(Boolean).length;
  const score = checks.length
    ? Math.round((matchedChecks / checks.length) * MATCH_WEIGHTS.ebitda)
    : MATCH_WEIGHTS.ebitda;
  const explanation = !checks.length
    ? "EBITDA is unrestricted by the buyer mandate."
    : [
        amountRestricted
          ? amountMatches
            ? "EBITDA amount is within range"
            : "EBITDA amount is outside range"
          : null,
        marginRestricted
          ? marginMatches
            ? "EBITDA margin is within range"
            : "EBITDA margin is outside range"
          : null,
      ]
        .filter(Boolean)
        .join("; ") + ".";
  return {
    dimension: "ebitda",
    score,
    maximum: MATCH_WEIGHTS.ebitda,
    explanation,
  };
}

function ownershipMatches(deal: Deal, project: BuyerProject) {
  if (project.ownership_preference === "flexible") return true;
  if (project.ownership_preference === "100_percent")
    return deal.ownership_percentage_available === 100;
  if (project.ownership_preference === "majority")
    return deal.ownership_percentage_available > 50;
  return (
    deal.ownership_percentage_available > 0 &&
    deal.ownership_percentage_available <= 50
  );
}

/** Pure, deterministic Phase 4 matcher. It performs no database access. */
export function matchDealToBuyerProject(
  deal: Deal,
  project: BuyerProject,
  context: MatchContext = {},
): MatchResult {
  const industryMatches =
    project.sectors.length === 0 ||
    project.sectors.some(
      (sector) => normalized(sector) === normalized(deal.sector),
    );
  const geographyMatches =
    project.provinces.length === 0 ||
    project.provinces.some(
      (province) => normalized(province) === normalized(deal.province),
    );
  const transactionMatches = project.transaction_type === deal.transaction_type;
  const ownershipFit = ownershipMatches(deal, project);

  const dealValues = [
    deal.min_expected_value ?? deal.asking_price,
    deal.max_expected_value ?? deal.asking_price,
  ];
  const dealValueMinimum = Math.min(...dealValues);
  const dealValueMaximum = Math.max(...dealValues);
  const valueUnrestricted =
    project.min_enterprise_value === null &&
    project.max_enterprise_value === null;
  const valueMatches =
    valueUnrestricted ||
    rangesOverlap(
      dealValueMinimum,
      dealValueMaximum,
      project.min_enterprise_value,
      project.max_enterprise_value,
    );

  const searchable = normalized(
    `${deal.title} ${deal.sector} ${deal.description} ${deal.confidential_summary}`,
  );
  const fitTerms = project.keywords.length
    ? project.keywords
    : Array.from(
        new Set(
          normalized(project.thesis)
            .split(/[^\p{L}\p{N}]+/u)
            .filter(
              (term) =>
                term.length >= 5 &&
                ![
                  "acquire",
                  "business",
                  "businesses",
                  "canadian",
                  "company",
                ].includes(term),
            ),
        ),
      ).slice(0, 12);
  const matchingKeywords = fitTerms.filter((keyword) =>
    searchable.includes(normalized(keyword)),
  );
  const keywordScore = fitTerms.length
    ? Math.round(
        (matchingKeywords.length / fitTerms.length) * MATCH_WEIGHTS.keywords,
      )
    : MATCH_WEIGHTS.keywords;

  const reasons: MatchReason[] = [
    {
      dimension: "industry",
      score: industryMatches ? MATCH_WEIGHTS.industry : 0,
      maximum: MATCH_WEIGHTS.industry,
      explanation: project.sectors.length
        ? industryMatches
          ? "The deal industry is included in the buyer mandate."
          : "The deal industry is outside the buyer mandate."
        : "Industry is unrestricted by the buyer mandate.",
    },
    rangeScore(
      "revenue",
      "Revenue",
      deal.revenue,
      project.min_revenue,
      project.max_revenue,
      MATCH_WEIGHTS.revenue,
    ),
    ebitdaReason(deal, project),
    {
      dimension: "geography",
      score: geographyMatches ? MATCH_WEIGHTS.geography : 0,
      maximum: MATCH_WEIGHTS.geography,
      explanation: project.provinces.length
        ? geographyMatches
          ? "The deal province is included in the buyer mandate."
          : "The deal province is outside the buyer mandate."
        : "Geography is unrestricted by the buyer mandate.",
    },
    {
      dimension: "transaction",
      score: transactionMatches ? MATCH_WEIGHTS.transaction : 0,
      maximum: MATCH_WEIGHTS.transaction,
      explanation: transactionMatches
        ? "The transaction type matches the buyer mandate."
        : "The transaction type differs from the buyer mandate.",
    },
    {
      dimension: "enterprise_value",
      score: valueMatches ? MATCH_WEIGHTS.enterprise_value : 0,
      maximum: MATCH_WEIGHTS.enterprise_value,
      explanation: valueUnrestricted
        ? "Enterprise value is unrestricted by the buyer mandate."
        : valueMatches
          ? "The seller's expected value overlaps the buyer mandate range."
          : "The seller's expected value does not overlap the buyer mandate range.",
    },
    {
      dimension: "ownership",
      score: ownershipFit ? MATCH_WEIGHTS.ownership : 0,
      maximum: MATCH_WEIGHTS.ownership,
      explanation: ownershipFit
        ? "Available ownership fits the buyer preference."
        : "Available ownership does not fit the buyer preference.",
    },
    {
      dimension: "keywords",
      score: keywordScore,
      maximum: MATCH_WEIGHTS.keywords,
      explanation: fitTerms.length
        ? matchingKeywords.length
          ? `Matched ${matchingKeywords.length} of ${fitTerms.length} structured keyword or thesis terms.`
          : "No structured keyword or thesis terms appear in the deal profile."
        : "Keywords and thesis terms are unrestricted by the buyer mandate.",
    },
  ];

  const hardExclusions: string[] = [];
  if (project.status !== "active")
    hardExclusions.push("The buyer mandate is not active.");
  if (
    project.organization_id === deal.owner_organization_id ||
    project.organization_id === deal.advisor_organization_id
  )
    hardExclusions.push(
      "The buyer belongs to the same organization as the deal team.",
    );
  if (normalized(deal.stage) === "closed")
    hardExclusions.push("The deal is closed.");
  if (context.buyerExplicitlyBlocked)
    hardExclusions.push("The buyer organization is blocked for this deal.");
  if (context.sellerExcluded)
    hardExclusions.push("The seller excluded this buyer organization.");
  if (context.marketplaceEnvironmentsMatch === false)
    hardExclusions.push(
      "Demo and registered-account marketplace records cannot be matched.",
    );
  if (
    deal.distribution_mode === "qualified_discovery" &&
    context.requiresDiscoveryVerification &&
    context.buyerVerificationStatus !== "verified"
  )
    hardExclusions.push(
      "Qualified Discovery requires a verified buyer organization.",
    );

  return {
    score: reasons.reduce((sum, item) => sum + item.score, 0),
    eligible: hardExclusions.length === 0,
    reasons,
    hard_exclusions: hardExclusions,
  };
}
