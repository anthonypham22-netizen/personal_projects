import type { MetadataRoute } from "next";
import { listPublicSitemapPaths } from "@/lib/public-network";
import {
  publicAbsoluteUrl,
  isPublicNetworkIndexingEnabled,
} from "@/lib/public-metadata";
import { pilotCapabilities } from "@/lib/pilot-capabilities";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicNetworkIndexingEnabled()) return [];
  if (!pilotCapabilities.publicNetwork)
    return [{ url: publicAbsoluteUrl("/") }];
  return [
    { url: publicAbsoluteUrl("/") },
    { url: publicAbsoluteUrl("/network") },
    ...(await listPublicSitemapPaths()).map((path) => ({
      url: publicAbsoluteUrl(path),
    })),
  ];
}
