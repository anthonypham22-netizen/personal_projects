import type { MetadataRoute } from "next";
import { listPublicSitemapPaths } from "@/lib/public-network";
import {
  publicAbsoluteUrl,
  isPublicNetworkIndexingEnabled,
} from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isPublicNetworkIndexingEnabled()) return [];
  return [
    { url: publicAbsoluteUrl("/") },
    { url: publicAbsoluteUrl("/network") },
    ...listPublicSitemapPaths().map((path) => ({
      url: publicAbsoluteUrl(path),
    })),
  ];
}
