import Link from "next/link";
import { ArrowRight, BadgeCheck, Compass, MapPin } from "lucide-react";
import {
  PublicFirmGrid,
  PublicTransactionCard,
} from "@/components/public-network";
import {
  listPublicFirms,
  listPublicIndustries,
  listPublicLocations,
  listPublicTransactions,
  publicDirectorySlug,
} from "@/lib/public-network";
import {
  publicPageMetadata,
  publicNetworkIndexingEnabled,
} from "@/lib/public-metadata";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata({
  title: "The network",
  description:
    "Explore opt-in Canadian acquisition firms and M&A advisors on Succera. Confidential operating businesses and active deals remain private.",
  path: "/network",
});

export default function NetworkPage() {
  const firms = listPublicFirms();
  const industries = listPublicIndustries();
  const locations = listPublicLocations();
  const transactions = listPublicTransactions({ limit: 6 });
  return (
    <>
      <section className="public-network-hero">
        <div className="public-network-hero-inner">
          <div>
            <p className="public-network-eyebrow">THE SUCCERA NETWORK</p>
            <h1>Find the people behind the next chapter.</h1>
            <p className="public-network-hero-copy">
              A curated directory of acquisition firms and M&A advisors who
              choose to be discoverable. Public profiles show only what each
              firm has approved for publication.
            </p>
            <div className="public-network-hero-actions">
              <Link className="button button-green" href="#firms">
                Explore public firms <ArrowRight size={17} />
              </Link>
              <Link className="button button-quiet" href="/register?role=buyer">
                Create your profile <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="public-network-hero-note">
            <Compass size={22} />
            <strong>Private by default</strong>
            <p>
              Active sell-side mandates, company identities, and confidential
              deal rooms never appear in this directory.
            </p>
          </div>
        </div>
      </section>
      <section className="public-network-section" id="firms">
        <div className="public-section-heading">
          <div>
            <p className="public-network-eyebrow">PUBLIC FIRMS</p>
            <h2>Acquirers and advisors</h2>
          </div>
          <span>{firms.length} opt-in profiles</span>
        </div>
        <PublicFirmGrid firms={firms} />
      </section>
      <section className="public-network-section public-directory-section">
        <div className="public-section-heading">
          <div>
            <p className="public-network-eyebrow">BROWSE BY FIT</p>
            <h2>Start with a market</h2>
          </div>
        </div>
        <div className="public-directory-grid">
          <div className="public-directory-card">
            <div className="public-directory-card-title">
              <BadgeCheck size={18} /> <strong>Industries</strong>
            </div>
            {industries.length ? (
              <ul>
                {industries.map(({ value, count }) => (
                  <li key={value}>
                    <Link href={`/industries/${publicDirectorySlug(value)}`}>
                      {value} <span>{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="public-network-empty-small">No industries yet.</p>
            )}
          </div>
          <div className="public-directory-card">
            <div className="public-directory-card-title">
              <MapPin size={18} /> <strong>Locations</strong>
            </div>
            {locations.length ? (
              <ul>
                {locations.map(({ value, count }) => (
                  <li key={value}>
                    <Link href={`/locations/${publicDirectorySlug(value)}`}>
                      {value} <span>{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="public-network-empty-small">No locations yet.</p>
            )}
          </div>
        </div>
      </section>
      {transactions.length > 0 && (
        <section className="public-network-section public-directory-section">
          <div className="public-section-heading">
            <div>
              <p className="public-network-eyebrow">VERIFIED TRACK RECORD</p>
              <h2>Recent public transactions</h2>
            </div>
            <span>{transactions.length} verified records</span>
          </div>
          <div className="public-transaction-grid">
            {transactions.map((transaction) => (
              <PublicTransactionCard
                transaction={transaction}
                key={transaction.public_slug}
              />
            ))}
          </div>
        </section>
      )}
      {!publicNetworkIndexingEnabled && (
        <p className="public-network-indexing-note">
          Search indexing is disabled in this environment. Public pages remain
          available by direct link while the network is being prepared.
        </p>
      )}
    </>
  );
}
