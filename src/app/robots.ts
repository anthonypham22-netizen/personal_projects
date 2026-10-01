import type { MetadataRoute } from "next";
import {
  publicAbsoluteUrl,
  isPublicNetworkIndexingEnabled,
} from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const indexingEnabled = isPublicNetworkIndexingEnabled();
  return {
    rules: {
      userAgent: "*",
      ...(indexingEnabled
        ? {
            allow: "/",
            disallow: ["/app", "/api", "/login", "/register"],
          }
        : { disallow: "/" }),
    },
    ...(indexingEnabled ? { sitemap: publicAbsoluteUrl("/sitemap.xml") } : {}),
  };
}
