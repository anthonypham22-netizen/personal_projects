import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFirmGrid } from "@/components/public-network";
import { getPublicLocationBySlug } from "@/lib/public-network";
import { publicPageMetadata } from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const directory = getPublicLocationBySlug((await params).slug);
  if (!directory)
    return {
      title: "Location directory not found",
      robots: { index: false, follow: false },
    };
  return publicPageMetadata({
    title: `M&A firms in ${directory.value}`,
    description: `Explore public acquisition firms and M&A advisors in ${directory.value} on Succera.`,
    path: `/locations/${(await params).slug}`,
  });
}

export default async function LocationRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const directory = getPublicLocationBySlug((await params).slug);
  if (!directory) notFound();
  return (
    <section className="public-directory-hero">
      <div className="public-directory-hero-inner">
        <Link className="public-network-back" href="/network">
          <ArrowRight size={15} className="rotate-180" /> Back to the network
        </Link>
        <p className="public-network-eyebrow">LOCATION DIRECTORY</p>
        <h1>M&A firms in {directory.value}</h1>
        <p className="public-directory-intro">
          Public acquisition firms and advisors with an approved presence in{" "}
          {directory.value}.
        </p>
        <PublicFirmGrid firms={directory.firms} />
      </div>
    </section>
  );
}
