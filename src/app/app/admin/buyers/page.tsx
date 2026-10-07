import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { listBuyerVerificationsForAdmin } from "@/lib/buyer-identity-verification";
import {
  BUYER_IDENTITY_VERIFICATION_STATUSES,
  BUYER_IDENTITY_VERIFICATION_STATUS_LABELS,
  type BuyerIdentityVerificationStatus,
} from "@/lib/types";
import { Brand } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Buyer reviews",
  robots: { index: false, follow: false },
};

const filters = [
  ...BUYER_IDENTITY_VERIFICATION_STATUSES.map(
    (status) =>
      [status, BUYER_IDENTITY_VERIFICATION_STATUS_LABELS[status]] as const,
  ),
  ["all", "All"],
] as const;

const statusLabel = (status: BuyerIdentityVerificationStatus) =>
  ({
    pending: "Pending review",
    needs_info: "More information required",
    approved: "Buyer profile reviewed",
    rejected: "Unable to approve",
  })[status];

const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeZone: "America/Toronto",
      }).format(new Date(value))
    : "Not submitted";

export default async function BuyerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const admin = await requirePlatformAdmin();

  const requestedStatus = (await searchParams).status;
  const selected = filters.some(([value]) => value === requestedStatus)
    ? (requestedStatus as (typeof filters)[number][0])
    : "pending";
  const verifications = await listBuyerVerificationsForAdmin(admin);
  const visible =
    selected === "all"
      ? verifications
      : verifications.filter((entry) => entry.status === selected);
  const counts = Object.fromEntries(
    filters.map(([status]) => [
      status,
      status === "all"
        ? verifications.length
        : verifications.filter((entry) => entry.status === status).length,
    ]),
  );

  return (
    <div className="admin-review-shell">
      <header className="admin-review-header">
        <Brand href="/app" />
        <Link href="/app">Back to workspace</Link>
      </header>
      <main className="admin-review-main">
        <div className="admin-review-title">
          <p className="eyebrow">ADMIN · BUYER TRUST</p>
          <h1>Buyer reviews</h1>
          <p>
            Review buyer identity and self-reported capital context before
            confidential access can be requested.
          </p>
        </div>

        <div className="verification-admin-intro">
          <ShieldCheck size={20} />
          <div>
            <strong>{counts.pending} pending review</strong>
            <p>
              Demo administrators see demo buyers only. Customer administrators
              see non-demo buyers only.
            </p>
          </div>
        </div>

        <nav className="admin-review-filters" aria-label="Buyer review status">
          {filters.map(([value, label]) => (
            <Link
              aria-current={selected === value ? "page" : undefined}
              className={selected === value ? "active" : undefined}
              href={`/app/admin/buyers?status=${value}`}
              key={value}
            >
              <span>{label}</span>
              <strong>{counts[value]}</strong>
            </Link>
          ))}
        </nav>

        <div className="verification-review-list">
          {visible.map((verification) => (
            <Link
              className="verification-review-card"
              href={`/app/admin/buyers/${verification.id}`}
              key={verification.id}
            >
              <header>
                <div>
                  <p className="eyebrow">{statusLabel(verification.status)}</p>
                  <h3>{verification.buyer_name}</h3>
                  <p>
                    {verification.buyer_company} · {verification.buyer_email}
                  </p>
                </div>
                <ArrowRight size={18} />
              </header>
              <div className="admin-review-card-meta">
                <span>{verification.buyer_type.replaceAll("_", " ")}</span>
                <span>
                  {verification.source_of_capital.replaceAll("_", " ")} ·
                  self-reported
                </span>
                <span>{dateLabel(verification.submitted_at)}</span>
              </div>
            </Link>
          ))}
          {!visible.length && (
            <div className="admin-review-empty">
              <strong>
                {selected === "pending"
                  ? "No buyer reviews waiting"
                  : "No buyer profiles match this review status"}
              </strong>
              <p>
                {selected === "pending"
                  ? "New buyer verification submissions will appear here."
                  : "Choose another status to continue reviewing applications."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
