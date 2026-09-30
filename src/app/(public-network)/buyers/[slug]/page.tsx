import type { Metadata } from "next";
import { FirmPage, firmMetadata } from "../../_firm-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return firmMetadata((await params).slug, "buyer");
}

export default async function BuyerRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <FirmPage slug={(await params).slug} kind="buyer" />;
}
