import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { isDemoAllowed } from "@/lib/app-environment";
export const metadata: Metadata = {
  title: "About this release",
  robots: { index: false, follow: false },
};
export default function Release() {
  const demoEnabled = isDemoAllowed();
  return (
    <main className="release-page">
      <Brand />
      <h1>About this release</h1>
      <p>
        Succera is an early software MVP for Canadian business acquisitions. The
        name is provisional.
        {demoEnabled &&
          " This environment contains fictional companies, users, financial figures, and agreements for testing."}
      </p>
      <h2>What works</h2>
      <p>
        Accounts, acquisition criteria, human-controlled teaser safety reviews,
        confidential teasers, controlled document sharing, internal buyer-firm
        review, external NDA verification, LOI submissions, private
        conversations, diligence tasks, deal-stage tracking, and role-scoped
        marketplace analytics are backed by a persistent database.
      </p>
      <h2>Before using real transaction information</h2>
      <p>
        This release has not completed independent security review or legal
        validation. Electronic signatures, live email delivery, independent
        identity or capital verification, automated malware scanning, password
        recovery, and subscription billing are not connected. Buyer verification
        is an internal platform review based on self-reported evidence; it is
        not legal accreditation, a guarantee of capital, or third-party due
        diligence. The NDA workflow records a human review of an externally
        executed document; uploading a file does not sign it.
      </p>
      <p>
        Teaser safety findings and rewrites can be incomplete or incorrect. The
        assistant never publishes content and does not replace seller, advisor,
        legal, privacy, or confidentiality review. Any enabled AI provider
        requires separate operator configuration, privacy review, and user
        disclosure.
      </p>
      <p>
        The operator must establish appropriate privacy notices, terms,
        retention policies, backups, and support processes before a live launch.
        Hosting and the remaining release requirements are documented in the
        source repository.
      </p>
      <Link href="/" className="button button-dark">
        Back to Succera
      </Link>
    </main>
  );
}
