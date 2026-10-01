import type { Metadata } from "next";
import { isStaging, type AppEnvironmentVariables } from "./app-environment";

type PublicMetadataEnvironment = AppEnvironmentVariables & {
  PUBLIC_NETWORK_INDEXING_ENABLED?: string;
};

export const isPublicNetworkIndexingEnabled = (
  environment: PublicMetadataEnvironment = process.env,
) =>
  environment.PUBLIC_NETWORK_INDEXING_ENABLED === "true" &&
  !isStaging(environment);

export const siteUrl = (environment: PublicMetadataEnvironment = process.env) =>
  environment.APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";

export const siteMetadataBase = (
  environment: PublicMetadataEnvironment = process.env,
) => new URL(siteUrl(environment));

export const publicAbsoluteUrl = (path: string) =>
  new URL(path, `${siteUrl()}/`).toString();

export function publicPageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const url = publicAbsoluteUrl(path);
  const indexingEnabled = isPublicNetworkIndexingEnabled();
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: {
      index: indexingEnabled,
      follow: indexingEnabled,
    },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "Succera",
      ...(image ? { images: [{ url: publicAbsoluteUrl(image) }] } : {}),
    },
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};

export const safeJsonLd = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
