import type { MetadataRoute } from "next";
import {
  publicAbsoluteUrl,
  publicNetworkIndexingEnabled,
} from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(publicNetworkIndexingEnabled
        ? {
            allow: "/",
            disallow: ["/app", "/api", "/login", "/register"],
          }
        : { disallow: "/" }),
    },
    ...(publicNetworkIndexingEnabled
      ? { sitemap: publicAbsoluteUrl("/sitemap.xml") }
      : {}),
  };
}
