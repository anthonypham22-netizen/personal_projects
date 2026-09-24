export const DEFAULT_QUALIFIED_DISCOVERY_MIN_SCORE = 70;

export function qualifiedDiscoveryMinimumScore() {
  const configured = Number.parseInt(
    process.env.QUALIFIED_DISCOVERY_MIN_SCORE || "",
    10,
  );
  return Number.isInteger(configured) && configured >= 0 && configured <= 100
    ? configured
    : DEFAULT_QUALIFIED_DISCOVERY_MIN_SCORE;
}
