import Link from "next/link";
import { ArrowRight, BadgeCheck, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTransactionBySlug } from "@/lib/public-network";
import { publicPageMetadata } from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

const transactionDate = (value: string) =>
  new Date(
    `${value.length === 10 ? `${value}T12:00:00` : value}Z`,
  ).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const transaction = await getPublicTransactionBySlug((await params).slug);
  if (!transaction)
    return {
      title: "Transaction not found",
      robots: { index: false, follow: false },
    };
  return publicPageMetadata({
    title: `${transaction.industry} acquisition`,
    description: `A verified, anonymized ${transaction.industry.toLowerCase()} acquisition completed by ${transaction.buyer_firm_name}.`,
    path: `/transactions/${transaction.public_slug}`,
  });
}

export default async function TransactionRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const transaction = await getPublicTransactionBySlug((await params).slug);
  if (!transaction) notFound();
  return (
    <>
      <section className="public-transaction-hero">
        <div className="public-transaction-hero-inner">
          <Link className="public-network-back" href="/network">
            <ArrowRight size={15} className="rotate-180" /> Back to the network
          </Link>
          <div className="public-transaction-card public-transaction-detail-card">
            <div className="public-firm-card-topline">
              <span className="public-network-icon" aria-hidden="true">
                <BadgeCheck size={20} strokeWidth={1.7} />
              </span>
              <span className="public-network-type">Verified transaction</span>
              <span className="public-verified-badge">
                {transaction.verification_label}
              </span>
            </div>
            <p className="public-network-eyebrow">ANONYMIZED TRACK RECORD</p>
            <h1>{transaction.industry} acquisition</h1>
            <div className="public-transaction-detail-meta">
              <span>
                <MapPin size={15} /> {transaction.province}
              </span>
              <span>Closed {transactionDate(transaction.closed_date)}</span>
              <span>
                Acquired by{" "}
                <Link href={`/buyers/${transaction.buyer_firm_slug}`}>
                  {transaction.buyer_firm_name}
                </Link>
              </span>
            </div>
            <p className="public-transaction-confidential-note">
              This record is intentionally anonymized. Only the fields
              explicitly approved by the acquiring firm are shown; company
              identities and confidential deal-room materials remain private.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
