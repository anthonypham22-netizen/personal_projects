export const APP_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export type AppEnvironmentVariables = {
  APP_ENV?: string;
  APP_URL?: string;
  NODE_ENV?: string;
  ALLOW_DEMO?: string;
  COOKIE_SECURE?: string;
  ELECTRONIC_SIGNATURE_PROVIDER?: string;
  TEASER_SAFETY_PROVIDER?: string;
};

const parsedAppUrl = (environment: AppEnvironmentVariables) => {
  const configured = environment.APP_URL?.trim();
  if (!configured) return undefined;
  try {
    return new URL(configured);
  } catch {
    throw new Error("APP_URL must be a valid absolute URL.");
  }
};

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const isSucceraProductionUrl = (environment: AppEnvironmentVariables) => {
  const url = parsedAppUrl(environment);
  return Boolean(
    url &&
    url.protocol === "https:" &&
    (url.hostname === "succera.io" || url.hostname === "www.succera.io"),
  );
};

export function getAppEnvironment(
  environment: AppEnvironmentVariables = process.env,
): AppEnvironment {
  const configured = environment.APP_ENV?.trim().toLowerCase();
  if (configured) {
    if (!APP_ENVIRONMENTS.includes(configured as AppEnvironment))
      throw new Error(
        `APP_ENV must be one of: ${APP_ENVIRONMENTS.join(", ")}.`,
      );
    return configured as AppEnvironment;
  }

  const url = parsedAppUrl(environment);
  if (url && isLocalHostname(url.hostname)) return "development";
  if (environment.NODE_ENV === "test") return "development";
  return environment.NODE_ENV === "production" ? "production" : "development";
}

export const isDevelopment = (
  environment: AppEnvironmentVariables = process.env,
) => getAppEnvironment(environment) === "development";

export const isStaging = (environment: AppEnvironmentVariables = process.env) =>
  getAppEnvironment(environment) === "staging";

export const isProduction = (
  environment: AppEnvironmentVariables = process.env,
) => getAppEnvironment(environment) === "production";

export const isDemoAllowed = (
  environment: AppEnvironmentVariables = process.env,
) =>
  environment.ALLOW_DEMO === "true" &&
  !isProduction(environment) &&
  !isSucceraProductionUrl(environment);

export function validateAppEnvironment(
  environment: AppEnvironmentVariables = process.env,
) {
  const appEnvironment = getAppEnvironment(environment);
  const appUrl = parsedAppUrl(environment);

  if (appEnvironment !== "development") {
    if (!appUrl)
      throw new Error(`APP_URL is required when APP_ENV=${appEnvironment}.`);
    if (appUrl.protocol !== "https:")
      throw new Error(`APP_URL must use HTTPS when APP_ENV=${appEnvironment}.`);
    if (environment.COOKIE_SECURE !== "true")
      throw new Error(
        `COOKIE_SECURE must be true when APP_ENV=${appEnvironment}.`,
      );
  }

  if (isSucceraProductionUrl(environment) && appEnvironment !== "production")
    throw new Error(
      "The succera.io production URL requires APP_ENV=production.",
    );

  if (appUrl?.hostname === "staging.succera.io" && appEnvironment !== "staging")
    throw new Error("The staging.succera.io URL requires APP_ENV=staging.");

  if (appEnvironment === "production") {
    if (environment.ALLOW_DEMO === "true")
      throw new Error("ALLOW_DEMO must be false when APP_ENV=production.");
    if (environment.ELECTRONIC_SIGNATURE_PROVIDER === "development")
      throw new Error(
        "The development electronic-signature provider is not permitted in production.",
      );
    if (environment.TEASER_SAFETY_PROVIDER === "development")
      throw new Error(
        "The development teaser-safety provider is not permitted in production.",
      );
  }

  return appEnvironment;
}
