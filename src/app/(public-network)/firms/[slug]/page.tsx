import { notFound, permanentRedirect } from "next/navigation";
import { pilotCapabilities } from "@/lib/pilot-capabilities";
import { getPublicFirmBySlug, publicFirmPath } from "@/lib/public-network";

export const dynamic = "force-dynamic";

export default async function FirmRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!pilotCapabilities.publicNetwork) return null;
  const firm = await getPublicFirmBySlug((await params).slug);
  if (!firm) notFound();
  permanentRedirect(publicFirmPath(firm));
}
