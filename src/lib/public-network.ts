import { all } from "./db";
import {
  BUYER_ORGANIZATION_TYPES,
  BUYER_VERIFICATION_STATUS_LABELS,
  type OrganizationType,
  type PublicDirectoryAggregate,
  type PublicDirectoryDetail,
  type PublicFirmDetail,
  type PublicFirmKind,
  type PublicFirmSummary,
  type PublicTransaction,
} from "./types";
import { slugify } from "./utils";
import { verificationStatusMeets } from "./verification";
import { isDemoAllowed } from "./app-environment";

export const publicDirectorySlug = (value: string) =>
  slugify(value, "directory");

export const publicFirmPath = ({
  kind,
  slug,
}: Pick<PublicFirmSummary, "kind" | "slug">) =>
  `/${kind === "buyer" ? "buyers" : "advisors"}/${slug}`;

type PublicFirmFilters = {
  kind?: PublicFirmKind;
  industry?: string;
  province?: string;
  slug?: string;
};
type PublicFirmRow = {
  slug: string;
  name: string;
  organization_type: OrganizationType;
  website: string;
  province: string;
  headline: string;
  public_description: string;
  show_website: number;
  show_province: number;
  show_verified_transactions: number;
  verification_status: keyof typeof BUYER_VERIFICATION_STATUS_LABELS;
};

const demoVisibilitySql = () =>
  isDemoAllowed()
    ? "1=1"
    : `EXISTS (
         SELECT 1
         FROM organization_members public_membership
         JOIN users public_member ON public_member.id=public_membership.user_id
         WHERE public_membership.organization_id=o.id
           AND public_membership.status='active'
           AND public_member.is_demo=0
       )`;

const firmKind = (organizationType: OrganizationType): PublicFirmKind =>
  organizationType === "advisor" ? "advisor" : "buyer";

const publicWebsite = (value: string) => {
  if (!value) return null;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol) ? value : null;
  } catch {
    return null;
  }
};

const publicOrganizationTypes = [
  "advisor",
  ...BUYER_ORGANIZATION_TYPES,
] as const;
const publicOrganizationTypeSql = `o.organization_type IN (${publicOrganizationTypes
  .map(() => "?")
  .join(",")})`;

const taxonomyFor = (organizationId: string) => ({
  industries: all<{ industry: string }>(
    `SELECT industry FROM organization_public_industries
     WHERE organization_id=? ORDER BY rowid`,
    organizationId,
  ).map(({ industry }) => industry),
  locations: all<{ province: string }>(
    `SELECT province FROM organization_public_locations
     WHERE organization_id=? ORDER BY rowid`,
    organizationId,
  ).map(({ province }) => province),
});

const taxonomiesFor = (organizationIds: string[]) => {
  const result = new Map<string, { industries: string[]; locations: string[] }>(
    organizationIds.map((organizationId) => [
      organizationId,
      { industries: [], locations: [] },
    ]),
  );
  if (!organizationIds.length) return result;
  const placeholders = organizationIds.map(() => "?").join(",");
  for (const row of all<{ organization_id: string; industry: string }>(
    `SELECT organization_id,industry FROM organization_public_industries
     WHERE organization_id IN (${placeholders}) ORDER BY rowid`,
    ...organizationIds,
  ))
    result.get(row.organization_id)?.industries.push(row.industry);
  for (const row of all<{ organization_id: string; province: string }>(
    `SELECT organization_id,province FROM organization_public_locations
     WHERE organization_id IN (${placeholders}) ORDER BY rowid`,
    ...organizationIds,
  ))
    result.get(row.organization_id)?.locations.push(row.province);
  return result;
};

const summaryFromRow = (
  row: PublicFirmRow & { organization_id: string },
  taxonomy = taxonomyFor(row.organization_id),
): PublicFirmSummary => {
  return {
    slug: row.slug,
    name: row.name,
    kind: firmKind(row.organization_type),
    organization_type: row.organization_type,
    headline: row.headline,
    public_description: row.public_description,
    website: row.show_website ? publicWebsite(row.website) : null,
    province: row.show_province && row.province ? row.province : null,
    industries: taxonomy.industries,
    locations: row.show_province ? taxonomy.locations : [],
    verification_label:
      firmKind(row.organization_type) === "buyer" &&
      verificationStatusMeets(row.verification_status, "firm_verified")
        ? BUYER_VERIFICATION_STATUS_LABELS[row.verification_status]
        : null,
  };
};

const firmRows = (filters: PublicFirmFilters = {}) => {
  const conditions = [
    "p.is_public=1",
    publicOrganizationTypeSql,
    demoVisibilitySql(),
  ];
  const params: (string | number)[] = [...publicOrganizationTypes];
  if (filters.kind === "advisor")
    conditions.push("o.organization_type='advisor'");
  if (filters.kind === "buyer")
    (conditions.push(
      `o.organization_type IN (${BUYER_ORGANIZATION_TYPES.map(() => "?").join(",")})`,
    ),
      params.push(...BUYER_ORGANIZATION_TYPES));
  if (filters.industry) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM organization_public_industries filter_industry
         WHERE filter_industry.organization_id=o.id
           AND filter_industry.industry=?
       )`,
    );
    params.push(filters.industry);
  }
  if (filters.province) {
    conditions.push(
      `p.show_province=1 AND EXISTS (
         SELECT 1 FROM organization_public_locations filter_location
         WHERE filter_location.organization_id=o.id
           AND filter_location.province=?
       )`,
    );
    params.push(filters.province);
  }
  if (filters.slug) {
    conditions.push("o.slug=?");
    params.push(filters.slug);
  }
  return all<PublicFirmRow & { organization_id: string }>(
    `SELECT o.id organization_id,o.slug,o.name,o.organization_type,o.website,
       o.province,p.headline,p.public_description,p.show_website,
       p.show_province,p.show_verified_transactions,o.verification_status
     FROM organizations o
     JOIN organization_public_profiles p ON p.organization_id=o.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY o.name,o.slug`,
    ...params,
  );
};

export function listPublicFirms(
  filters: PublicFirmFilters = {},
): PublicFirmSummary[] {
  const rows = firmRows(filters);
  const taxonomies = taxonomiesFor(rows.map((row) => row.organization_id));
  return rows.map((row) =>
    summaryFromRow(row, taxonomies.get(row.organization_id)),
  );
}

const publicTransactionRows = (
  extraWhere = "",
  params: (string | number)[] = [],
  limit?: number,
) =>
  all<
    PublicTransaction & {
      buyer_organization_id: string;
    }
  >(
    `SELECT ct.public_slug,ct.industry,ct.province,ct.enterprise_value,
       ct.closed_date,
       o.slug buyer_firm_slug,o.name buyer_firm_name,
       ct.buyer_organization_id
     FROM closed_transactions ct
     JOIN organizations o ON o.id=ct.buyer_organization_id
     JOIN organization_public_profiles p ON p.organization_id=o.id
     WHERE ct.verified=1 AND ct.public_opt_in=1 AND ct.public_slug IS NOT NULL
       AND p.is_public=1 AND p.show_verified_transactions=1
       AND ${publicOrganizationTypeSql}
       AND ${demoVisibilitySql()}
       ${extraWhere}
     ORDER BY ct.closed_date DESC,ct.public_slug
     ${limit === undefined ? "" : "LIMIT ?"}`,
    ...publicOrganizationTypes,
    ...params,
    ...(limit === undefined ? [] : [limit]),
  ).map(({ buyer_organization_id: _buyerOrganizationId, ...row }) => ({
    ...row,
    public_slug: row.public_slug!,
    verification_label: "Succera verified" as const,
  }));

export function listPublicTransactions(
  filters: {
    industry?: string;
    province?: string;
    limit?: number;
  } = {},
): PublicTransaction[] {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.industry) {
    conditions.push("ct.industry=?");
    params.push(filters.industry);
  }
  if (filters.province) {
    conditions.push("ct.province=?");
    params.push(filters.province);
  }
  return publicTransactionRows(
    conditions.length ? `AND ${conditions.join(" AND ")}` : "",
    params,
    filters.limit === undefined
      ? undefined
      : Math.max(1, Math.min(100, Math.trunc(filters.limit))),
  );
}

export function getPublicTransactionBySlug(
  publicSlug: string,
): PublicTransaction | undefined {
  return publicTransactionRows("AND ct.public_slug=?", [publicSlug])[0];
}

export function getPublicFirmBySlug(
  slug: string,
  kind?: PublicFirmKind,
): PublicFirmDetail | undefined {
  const row = firmRows({ kind, slug })[0];
  if (!row) return undefined;
  const summary = summaryFromRow(row);
  const transactions =
    summary.kind === "buyer" && row.show_verified_transactions
      ? publicTransactionRows("AND o.slug=?", [row.slug])
      : [];
  const detail: PublicFirmDetail = {
    ...summary,
    verified_transaction_count: transactions.length,
    transactions,
  };
  return detail;
}

export function listPublicIndustries(): PublicDirectoryAggregate[] {
  return all<PublicDirectoryAggregate>(
    `SELECT industry value,COUNT(*) count
     FROM organization_public_industries public_industry
     JOIN organizations o ON o.id=public_industry.organization_id
     JOIN organization_public_profiles p ON p.organization_id=o.id
     WHERE p.is_public=1 AND ${publicOrganizationTypeSql}
       AND ${demoVisibilitySql()}
     GROUP BY industry ORDER BY industry`,
    ...publicOrganizationTypes,
  );
}

export function getPublicIndustry(
  industry: string,
): PublicDirectoryDetail | undefined {
  const firms = listPublicFirms({ industry });
  return firms.length ? { value: industry, firms } : undefined;
}

export function getPublicIndustryBySlug(
  slug: string,
): PublicDirectoryDetail | undefined {
  const aggregate = listPublicIndustries().find(
    ({ value }) => publicDirectorySlug(value) === slug,
  );
  return aggregate ? getPublicIndustry(aggregate.value) : undefined;
}

export function listPublicLocations(): PublicDirectoryAggregate[] {
  return all<PublicDirectoryAggregate>(
    `SELECT public_location.province value,COUNT(*) count
     FROM organization_public_locations public_location
     JOIN organizations o ON o.id=public_location.organization_id
     JOIN organization_public_profiles p ON p.organization_id=o.id
     WHERE p.is_public=1 AND p.show_province=1
       AND ${publicOrganizationTypeSql}
       AND ${demoVisibilitySql()}
     GROUP BY public_location.province ORDER BY public_location.province`,
    ...publicOrganizationTypes,
  );
}

export function getPublicLocation(
  province: string,
): PublicDirectoryDetail | undefined {
  const firms = listPublicFirms({ province });
  return firms.length ? { value: province, firms } : undefined;
}

export function getPublicLocationBySlug(
  slug: string,
): PublicDirectoryDetail | undefined {
  const aggregate = listPublicLocations().find(
    ({ value }) => publicDirectorySlug(value) === slug,
  );
  return aggregate ? getPublicLocation(aggregate.value) : undefined;
}

export function listPublicSitemapPaths(): string[] {
  const firms = listPublicFirms();
  const firmPaths = firms.map(publicFirmPath);
  const transactionPaths = listPublicTransactions().map(
    (transaction) => `/transactions/${transaction.public_slug}`,
  );
  const industryPaths = listPublicIndustries().map(
    ({ value }) => `/industries/${publicDirectorySlug(value)}`,
  );
  const locationPaths = listPublicLocations().map(
    ({ value }) => `/locations/${publicDirectorySlug(value)}`,
  );
  return [
    ...firmPaths,
    ...transactionPaths,
    ...industryPaths,
    ...locationPaths,
  ];
}
