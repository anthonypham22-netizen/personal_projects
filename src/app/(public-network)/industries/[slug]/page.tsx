import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFirmGrid } from "@/components/public-network";
import { getPublicIndustryBySlug } from "@/lib/public-network";
import { publicPageMetadata } from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const directory = getPublicIndustryBySlug((await params).slug);
  if (!directory)
    return {
      title: "Industry directory not found",
      robots: { index: false, follow: false },
    };
  return publicPageMetadata({
    title: `${directory.value} M&A network`,
    description: `Explore public acquisition firms and M&A advisors active in ${directory.value} on Succera.`,
    path: `/industries/${(await params).slug}`,
  });
}

export default async function IndustryRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const directory = getPublicIndustryBySlug((await params).slug);
  if (!directory) notFound();
  return (
    <section className="public-directory-hero">
      <div className="public-directory-hero-inner">
        <Link className="public-network-back" href="/network">
          <ArrowRight size={15} className="rotate-180" /> Back to the network
        </Link>
        <p className="public-network-eyebrow">INDUSTRY DIRECTORY</p>
        <h1>{directory.value} M&A network</h1>
        <p className="public-directory-intro">
          Public acquisition firms and advisors who have chosen to be
          discoverable in {directory.value.toLowerCase()}.
        </p>
        <PublicFirmGrid firms={directory.firms} />
      </div>
    </section>
  );
}
