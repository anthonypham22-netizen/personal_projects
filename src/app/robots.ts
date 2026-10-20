import type { MetadataRoute } from "next";
import {
  publicAbsoluteUrl,
  isPublicNetworkIndexingEnabled,
} from "@/lib/public-metadata";
import { pilotCapabilities } from "@/lib/pilot-capabilities";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const indexingEnabled = isPublicNetworkIndexingEnabled();
  const privatePaths = ["/app", "/api", "/login", "/register"];
  const disabledNetworkPaths = [
    "/network",
    "/advisors",
    "/buyers",
    "/firms",
    "/industries",
    "/locations",
    "/transactions",
  ];
  return {
    rules: {
      userAgent: "*",
      ...(indexingEnabled
        ? {
            allow: "/",
            disallow: [
              ...privatePaths,
              ...(pilotCapabilities.publicNetwork ? [] : disabledNetworkPaths),
            ],
          }
        : { disallow: "/" }),
    },
    ...(indexingEnabled ? { sitemap: publicAbsoluteUrl("/sitemap.xml") } : {}),
  };
}
