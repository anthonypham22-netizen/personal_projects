import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { buyerVerificationForAdmin } from "@/lib/buyer-identity-verification";
import { Brand } from "@/components/brand";
import { BuyerVerificationDecisionForm } from "@/components/buyer-verification-admin";
import { money as formatMoney } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review buyer",
  robots: { index: false, follow: false },
};

const label = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace("2 5", "2.5");

const dateTimeLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Toronto",
      }).format(new Date(value))
    : "Not yet";

const money = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "Not specified"
    : formatMoney(value, false);

export default async function BuyerReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePlatformAdmin();
  const verification = await buyerVerificationForAdmin(
    admin,
    (await params).id,
  );
  if (!verification) notFound();

  return (
    <div className="admin-review-shell">
      <header className="admin-review-header">
        <Brand href="/app" />
        <Link href="/app/admin/buyers">Back to buyer reviews</Link>
      </header>
      <main className="admin-review-main">
        <div className="admin-review-title">
          <p className="eyebrow">{label(verification.status)}</p>
          <h1>{verification.buyer_name}</h1>
          <p>
            {verification.buyer_company} · {verification.buyer_email}
          </p>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <h2>Account</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div>
              <span>Name</span>
              <strong>{verification.buyer_name}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{verification.buyer_email}</strong>
            </div>
            <div>
              <span>Company</span>
              <strong>{verification.buyer_company}</strong>
            </div>
            <div>
              <span>Province</span>
              <strong>{verification.buyer_province || "Not provided"}</strong>
            </div>
            <div>
              <span>Marketplace role</span>
              <strong>{label(verification.buyer_role)}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Buyer profile</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div>
              <span>Buyer type</span>
              <strong>{label(verification.buyer_type)}</strong>
            </div>
            <div>
              <span>LinkedIn</span>
              {verification.linkedin_url ? (
                <a
                  href={verification.linkedin_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  View profile
                </a>
              ) : (
                <strong>Not provided</strong>
              )}
            </div>
            <div>
              <span>Website</span>
              {verification.website_url ? (
                <a
                  href={verification.website_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Visit website
                </a>
              ) : (
                <strong>Not provided</strong>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Acquisition criteria</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div className="full">
              <span>Sectors</span>
              <strong>{verification.buyer_sectors || "Not specified"}</strong>
            </div>
            <div>
              <span>Geography</span>
              <strong>{verification.buyer_province || "Not specified"}</strong>
            </div>
            <div>
              <span>Revenue range</span>
              <strong>
                {money(verification.buyer_min_revenue)} –{" "}
                {money(verification.buyer_max_revenue)}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Capital · self-reported</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div>
              <span>Source of capital</span>
              <strong>{label(verification.source_of_capital)}</strong>
            </div>
            <div>
              <span>Approximate equity range</span>
              <strong>{label(verification.equity_range)}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Experience</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div>
              <span>Completed acquisitions</span>
              <strong>{verification.completed_acquisitions}</strong>
            </div>
            <div className="full">
              <span>Experience</span>
              <p>{verification.experience_summary}</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Strategy</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div className="full">
              <span>Acquisition strategy</span>
              <p>{verification.acquisition_strategy}</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Declaration</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div className="full">
              <span>Authorized to represent</span>
              <strong>
                {verification.authorized_to_represent ? "Yes" : "No"}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Review</h2>
          </div>
          <div className="panel-body verification-evidence-sheet">
            <div>
              <span>Status</span>
              <strong>{label(verification.status)}</strong>
            </div>
            <div>
              <span>Submitted</span>
              <strong>{dateTimeLabel(verification.submitted_at)}</strong>
            </div>
            <div>
              <span>Reviewed</span>
              <strong>{dateTimeLabel(verification.reviewed_at)}</strong>
            </div>
            <div>
              <span>Reviewer</span>
              <strong>
                {verification.reviewer_name
                  ? `${verification.reviewer_name}${verification.reviewer_email ? ` · ${verification.reviewer_email}` : ""}`
                  : "Not yet reviewed"}
              </strong>
            </div>
            <div className="full">
              <span>Review note</span>
              <p>{verification.review_notes || "No review note."}</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Review decision</h2>
          </div>
          <div className="panel-body">
            <BuyerVerificationDecisionForm id={verification.id} />
          </div>
        </section>
      </main>
    </div>
  );
}
