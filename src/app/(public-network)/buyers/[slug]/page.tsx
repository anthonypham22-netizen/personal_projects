import type { Metadata } from "next";
import { FirmPage, firmMetadata } from "../../_firm-page";
import { pilotCapabilities } from "@/lib/pilot-capabilities";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!pilotCapabilities.publicNetwork)
    return {
      title: "Private network",
      robots: { index: false, follow: false },
    };
  return firmMetadata((await params).slug, "buyer");
}

export default async function BuyerRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!pilotCapabilities.publicNetwork) return null;
  return <FirmPage slug={(await params).slug} kind="buyer" />;
}
