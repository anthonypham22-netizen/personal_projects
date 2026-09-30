import { AuthForm } from "@/components/auth-form";
import type { Role } from "@/lib/types";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  return (
    <AuthForm
      mode="register"
      demo={process.env.ALLOW_DEMO === "true"}
      registration={process.env.ALLOW_REGISTRATION !== "false"}
      initialRole={
        ["buyer", "owner", "advisor"].includes(role || "")
          ? (role as Role)
          : "buyer"
      }
    />
  );
}
