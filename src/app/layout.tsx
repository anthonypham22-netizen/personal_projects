import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import {
  isPublicNetworkIndexingEnabled,
  siteMetadataBase,
} from "@/lib/public-metadata";
import { EnvironmentBanner } from "@/components/environment-banner";
import { getAppEnvironment } from "@/lib/app-environment";
import { cn } from "@/lib/utils";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const indexingEnabled = isPublicNetworkIndexingEnabled();
  return {
    metadataBase: siteMetadataBase(),
    title: {
      default: "Succera — The next chapter starts here",
      template: "%s · Succera",
    },
    description:
      "A private workspace for Canadian business acquisitions. Connect buyers, owners, and advisors, and move every deal forward.",
    robots: {
      index: indexingEnabled,
      follow: indexingEnabled,
    },
    icons: { icon: "/favicon.svg" },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const appEnvironment = getAppEnvironment();
  return (
    <html lang="en">
      <body
        className={cn(appEnvironment === "staging" && "has-environment-banner")}
      >
        <EnvironmentBanner environment={appEnvironment} />
        {children}
      </body>
    </html>
  );
}
