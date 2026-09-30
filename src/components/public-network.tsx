import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  MapPin,
} from "lucide-react";
import type {
  PublicFirmDetail,
  PublicFirmSummary,
  PublicTransaction,
} from "@/lib/types";
import { publicFirmPath } from "@/lib/public-network";

const formatMoney = (value: number | null) =>
  value === null
    ? "Enterprise value not disclosed"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0,
        notation: "compact",
      }).format(value);

const formatDate = (value: string) =>
  new Date(
    `${value.length === 10 ? `${value}T12:00:00` : value}Z`,
  ).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  });

export function PublicFirmCard({ firm }: { firm: PublicFirmSummary }) {
  return (
    <article className="public-firm-card">
      <div className="public-firm-card-topline">
        <span className="public-network-icon" aria-hidden="true">
          <Building2 size={19} strokeWidth={1.7} />
        </span>
        <span className="public-network-type">
          {firm.kind === "buyer" ? "Acquisition firm" : "M&A advisor"}
        </span>
        {firm.verification_label && (
          <span className="public-verified-badge">
            <BadgeCheck size={14} /> {firm.verification_label}
          </span>
        )}
      </div>
      <h3>{firm.name}</h3>
      {firm.headline && <p className="public-firm-headline">{firm.headline}</p>}
      <p className="public-firm-description">{firm.public_description}</p>
      <div className="public-firm-meta">
        {firm.province && (
          <span>
            <MapPin size={14} /> {firm.province}
          </span>
        )}
        {firm.industries.slice(0, 2).map((industry) => (
          <span className="public-network-pill" key={industry}>
            {industry}
          </span>
        ))}
      </div>
      <Link className="public-card-link" href={publicFirmPath(firm)}>
        View profile <ArrowRight size={15} />
      </Link>
    </article>
  );
}

export function PublicTransactionCard({
  transaction,
}: {
  transaction: PublicTransaction;
}) {
  return (
    <article className="public-transaction-card">
      <div className="public-firm-card-topline">
        <span className="public-network-icon" aria-hidden="true">
          <BadgeCheck size={18} strokeWidth={1.7} />
        </span>
        <span className="public-network-type">Verified transaction</span>
        <span className="public-verified-badge">
          {transaction.verification_label}
        </span>
      </div>
      <h3>{transaction.industry} acquisition</h3>
      <div className="public-firm-meta">
        <span>
          <MapPin size={14} /> {transaction.province}
        </span>
        <span>Closed {formatDate(transaction.closed_date)}</span>
        <span>{formatMoney(transaction.enterprise_value)}</span>
      </div>
      <Link
        className="public-card-link"
        href={`/buyers/${transaction.buyer_firm_slug}`}
      >
        View acquiring firm <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}

export function PublicFirmDetails({ firm }: { firm: PublicFirmDetail }) {
  return (
    <>
      <div className="public-firm-detail-grid">
        <section className="public-network-card public-firm-about">
          <p className="public-network-eyebrow">
            {firm.kind === "buyer" ? "ACQUISITION FIRM" : "M&A ADVISOR"}
          </p>
          <h1>{firm.name}</h1>
          {firm.headline && (
            <p className="public-firm-detail-headline">{firm.headline}</p>
          )}
          <p className="public-firm-detail-description">
            {firm.public_description ||
              "This firm has not added a public description yet."}
          </p>
          <div className="public-firm-meta public-firm-detail-meta">
            {firm.province && (
              <span>
                <MapPin size={15} /> {firm.province}
              </span>
            )}
            {firm.website && (
              <a href={firm.website} target="_blank" rel="noreferrer">
                Visit website <ArrowUpRight size={14} />
              </a>
            )}
          </div>
          <div className="public-network-taxonomy">
            {firm.industries.map((industry) => (
              <span className="public-network-pill" key={industry}>
                {industry}
              </span>
            ))}
            {firm.locations.map((location) => (
              <span className="public-network-pill" key={location}>
                {location}
              </span>
            ))}
          </div>
        </section>
        <aside className="public-network-card public-firm-trust">
          <p className="public-network-eyebrow">AT A GLANCE</p>
          {firm.verification_label && (
            <div className="public-trust-row">
              <BadgeCheck size={18} />
              <div>
                <strong>{firm.verification_label}</strong>
                <span>Reviewed by the Succera team</span>
              </div>
            </div>
          )}
          <div className="public-trust-stat">
            <strong>{firm.verified_transaction_count}</strong>
            <span>verified public transactions</span>
          </div>
          <p className="public-trust-note">
            Only information explicitly approved for public publication is
            shown.
          </p>
        </aside>
      </div>
      {firm.kind === "buyer" && (
        <section className="public-network-card public-firm-transactions">
          <div className="public-section-heading">
            <div>
              <p className="public-network-eyebrow">TRACK RECORD</p>
              <h2>Verified transactions</h2>
            </div>
            <span>{firm.verified_transaction_count} public records</span>
          </div>
          {firm.transactions.length ? (
            <div className="public-transaction-grid">
              {firm.transactions.map((transaction) => (
                <PublicTransactionCard
                  transaction={transaction}
                  key={transaction.public_slug}
                />
              ))}
            </div>
          ) : (
            <p className="public-network-empty">
              This firm has not published any verified transaction records.
            </p>
          )}
        </section>
      )}
    </>
  );
}

export function PublicFirmGrid({ firms }: { firms: PublicFirmSummary[] }) {
  return firms.length ? (
    <div className="public-firm-grid">
      {firms.map((firm) => (
        <PublicFirmCard key={`${firm.kind}-${firm.slug}`} firm={firm} />
      ))}
    </div>
  ) : (
    <div className="public-network-empty">
      <Building2 size={26} strokeWidth={1.5} />
      <h2>No public firms match this directory yet.</h2>
      <p>
        Public profiles are opt-in and confidential operating businesses are
        never listed.
      </p>
    </div>
  );
}
