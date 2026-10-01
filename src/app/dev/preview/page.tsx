import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RolePreview } from "@/components/role-preview";
import { isRolePreviewEnabled } from "@/lib/demo-mode";

export const metadata: Metadata = {
  title: "Developer role preview",
  robots: { index: false, follow: false },
};

export default async function DevRolePreviewPage() {
  await connection();
  if (!isRolePreviewEnabled()) notFound();
  return <RolePreview />;
}
