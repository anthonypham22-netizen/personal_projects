import {
  BUYER_VERIFICATION_STATUSES,
  type BuyerVerificationStatus,
} from "./types.ts";

export const DEFAULT_QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS =
  "firm_verified" satisfies BuyerVerificationStatus;

export const QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUSES = [
  "unverified",
  "email_verified",
  "firm_verified",
  "capital_reviewed",
  "verified_acquirer",
] as const satisfies readonly BuyerVerificationStatus[];

const verificationRanks: Record<BuyerVerificationStatus, number> = {
  rejected: -1,
  unverified: 0,
  email_verified: 1,
  firm_verified: 2,
  capital_reviewed: 3,
  verified_acquirer: 4,
};

export function isBuyerVerificationStatus(
  value: string,
): value is BuyerVerificationStatus {
  return (BUYER_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function verificationStatusMeets(
  current: BuyerVerificationStatus | string,
  minimum: BuyerVerificationStatus | string,
) {
  if (
    !isBuyerVerificationStatus(current) ||
    !isBuyerVerificationStatus(minimum) ||
    current === "rejected" ||
    minimum === "rejected"
  )
    return false;
  return verificationRanks[current] >= verificationRanks[minimum];
}

export function qualifiedDiscoveryEligibleVerificationStatuses(
  minimum: BuyerVerificationStatus = qualifiedDiscoveryMinimumVerificationStatus(),
): BuyerVerificationStatus[] {
  if (
    !(
      QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUSES as readonly string[]
    ).includes(minimum)
  )
    return [];
  return [...QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUSES].filter((status) =>
    verificationStatusMeets(status, minimum),
  );
}

export function qualifiedDiscoveryMinimumVerificationStatus(): BuyerVerificationStatus {
  const configured =
    process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS?.trim();
  return configured &&
    (
      QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUSES as readonly string[]
    ).includes(configured)
    ? (configured as BuyerVerificationStatus)
    : DEFAULT_QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;
}
