import { AuthForm } from "@/components/auth-form";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export default function Login() {
  return <AuthForm mode="login" demo={process.env.ALLOW_DEMO === "true"} />;
}
