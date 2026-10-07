import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requirePlatformAdmin } from "@/lib/auth";
import { buyerVerificationCountsForAdmin } from "@/lib/buyer-identity-verification";
import {
  BUYER_IDENTITY_VERIFICATION_STATUSES,
  BUYER_IDENTITY_VERIFICATION_STATUS_LABELS,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Platform administration",
  robots: { index: false, follow: false },
};

export default async function PlatformAdminPage() {
  const admin = await requirePlatformAdmin();
  const counts = await buyerVerificationCountsForAdmin(admin);

  return (
    <div className="admin-review-shell">
      <header className="admin-review-header">
        <Brand href="/app" />
        <Link href="/app">Back to workspace</Link>
      </header>
      <main className="admin-review-main">
        <div className="admin-review-title">
          <p className="eyebrow">INTERNAL · SUCCERA OPERATIONS</p>
          <h1>Platform administration</h1>
          <p>
            Review buyer applications without changing marketplace roles or
            deal-room permissions.
          </p>
        </div>

        <section className="admin-home-card">
          <div className="admin-home-card-icon" aria-hidden="true">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="eyebrow">BUYER TRUST</p>
            <h2>Buyer reviews</h2>
            <p>
              {counts.pending
                ? `${counts.pending} application${counts.pending === 1 ? "" : "s"} waiting for review.`
                : "No buyer reviews waiting."}
            </p>
          </div>
          <Link className="button button-quiet" href="/app/admin/buyers">
            Open review queue <ArrowRight size={16} />
          </Link>
        </section>

        <div className="admin-status-grid" aria-label="Buyer review summary">
          {BUYER_IDENTITY_VERIFICATION_STATUSES.map((status) => (
            <Link href={`/app/admin/buyers?status=${status}`} key={status}>
              <span>{BUYER_IDENTITY_VERIFICATION_STATUS_LABELS[status]}</span>
              <strong>{counts[status]}</strong>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
