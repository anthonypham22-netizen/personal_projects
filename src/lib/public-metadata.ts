import type { Metadata } from "next";

export const publicNetworkIndexingEnabled =
  process.env.PUBLIC_NETWORK_INDEXING_ENABLED === "true";

const configuredSiteUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
export const siteUrl = configuredSiteUrl || "http://localhost:3000";
export const siteMetadataBase = new URL(siteUrl);

export const publicAbsoluteUrl = (path: string) =>
  new URL(path, `${siteUrl}/`).toString();

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
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: {
      index: publicNetworkIndexingEnabled,
      follow: publicNetworkIndexingEnabled,
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
