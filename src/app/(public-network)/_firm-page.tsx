import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicFirmDetails } from "@/components/public-network";
import { getPublicFirmBySlug, publicFirmPath } from "@/lib/public-network";
import {
  publicPageMetadata,
  publicAbsoluteUrl,
  safeJsonLd,
} from "@/lib/public-metadata";
import type { PublicFirmKind } from "@/lib/types";

export function firmMetadata(slug: string, kind: PublicFirmKind): Metadata {
  const firm = getPublicFirmBySlug(slug, kind);
  if (!firm) {
    return {
      title: "Public profile not found",
      robots: { index: false, follow: false },
    };
  }
  const canonicalPath = publicFirmPath(firm);
  return publicPageMetadata({
    title: firm.name,
    description:
      firm.headline ||
      firm.public_description ||
      `${firm.name} is part of the Succera Canadian M&A network.`,
    path: canonicalPath,
  });
}

export function FirmPage({
  slug,
  kind,
}: {
  slug: string;
  kind: PublicFirmKind;
}) {
  const firm = getPublicFirmBySlug(slug, kind);
  if (!firm) notFound();
  const path = publicFirmPath(firm);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: firm.name,
    description: firm.public_description || undefined,
    url: publicAbsoluteUrl(path),
    ...(firm.website ? { sameAs: [firm.website] } : {}),
    ...(firm.province
      ? {
          address: {
            "@type": "PostalAddress",
            addressRegion: firm.province,
            addressCountry: "CA",
          },
        }
      : {}),
  };
  return (
    <>
      <section className="public-firm-hero">
        <div className="public-firm-hero-inner">
          <div className="public-network-breadcrumb">
            <a href="/network">The network</a>
            <span>/</span>
            <span>
              {kind === "buyer"
                ? "Acquisition firms"
                : kind === "advisor"
                  ? "M&A advisors"
                  : "Public firms"}
            </span>
          </div>
          <PublicFirmDetails firm={firm} />
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
    </>
  );
}
