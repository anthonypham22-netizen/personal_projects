import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  FolderLock,
  MessagesSquare,
  Building2,
  BriefcaseBusiness,
  Handshake,
  Search,
  UsersRound,
  FileSignature,
  LockKeyhole,
} from "lucide-react";
import { Brand, BrandEmblem } from "@/components/brand";

export const metadata: Metadata = {
  title: {
    absolute: "Succera | Private M&A Marketplace for Canadian Businesses",
  },
  description:
    "Succera connects Canadian business owners, acquisition buyers, and M&A advisors in one private marketplace and deal workspace.",
};

export default function Home() {
  return (
    <>
      <header className="marketing-header">
        <div className="marketing-nav homepage-nav">
          <Brand />
          <nav aria-label="Main navigation">
            <Link href="/register?role=buyer">Opportunities</Link>
            <a href="#for-sellers">For sellers</a>
            <a href="#for-buyers">For buyers</a>
            <a href="#for-advisors">For advisors</a>
            <a href="#process">How it works</a>
          </nav>
          <div className="nav-actions">
            <Link className="text-link" href="/login">
              Sign in
            </Link>
            <Link className="button button-dark" href="/register">
              Get started <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="tiny-maple">✳</span> BUILT FOR CANADIAN M&A
              </p>
              <h1>
                Great businesses.
                <br />
                New beginnings.
              </h1>
              <p className="hero-description">
                Succera is the private marketplace for Canadian business
                acquisitions, connecting owners, qualified buyers, and advisors
                from introduction to close.
              </p>
              <div className="hero-actions">
                <Link
                  href="/register?role=buyer"
                  className="button button-green"
                >
                  Explore opportunities <ArrowRight size={18} />
                </Link>
                <Link
                  href="/register?role=owner"
                  className="button button-quiet"
                >
                  List a business <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="hero-proof">
                <ShieldCheck size={18} />
                <span>Confidential by design</span>
                <span className="divider-dot">·</span>
                <span>Qualified buyers</span>
                <span className="divider-dot">·</span>
                <span>One secure deal workspace</span>
              </div>
            </div>
            <div className="hero-product" aria-label="How Succera works">
              <div className="mock-header">
                <BrandEmblem />
                <div className="product-card-title">
                  <span>SUCCERA</span>
                  <h2>Private M&A. One workspace.</h2>
                </div>
                <span className="badge badge-green">CANADA</span>
              </div>
              <ol className="product-steps">
                {[
                  {
                    Icon: Search,
                    label: "DISCOVER",
                    text: "Private acquisition opportunities",
                  },
                  {
                    Icon: UsersRound,
                    label: "CONNECT",
                    text: "Qualified owners, buyers and advisors",
                  },
                  {
                    Icon: FileSignature,
                    label: "TRANSACT",
                    text: "NDA, diligence, LOI and close",
                  },
                ].map(({ Icon, label, text }, index) => (
                  <li className="product-step" key={label}>
                    <span className="product-step-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="product-step-icon">
                      <Icon size={20} strokeWidth={1.6} />
                    </span>
                    <div className="product-step-copy">
                      <strong>{label}</strong>
                      <span>{text}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mock-progress">
                <span className="check-icon">
                  <LockKeyhole size={15} />
                </span>
                <div>
                  <strong>Confidential by design.</strong>
                  <span>
                    Control access to sensitive information at every step.
                  </span>
                </div>
                <ShieldCheck size={21} />
              </div>
            </div>
          </div>
          <div className="hero-bottom">
            <span>PRIVATE BY DESIGN</span>
            <span>Qualified buyers</span>
            <span>Confidential opportunities</span>
            <span>Secure deal rooms</span>
            <span>Canadian businesses</span>
          </div>
        </section>
        <section id="platform" className="marketing-section">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">LESS FRICTION. MORE FORWARD.</p>
              <h2>
                Keep the deal moving.
                <br />
                Keep everyone aligned.
              </h2>
              <p className="section-lead">
                A shared workspace for every introduction, document, decision,
                and next step.
              </p>
            </div>
            <div className="section-context">
              <p className="eyebrow">ONE WORKSPACE. END TO END.</p>
              <h3>One place for every moving part.</h3>
              <p className="section-context-body">
                Connect the right people, control access to sensitive
                information, and keep every step moving from first introduction
                to close.
              </p>
              <ul className="section-feature-list" aria-label="Deal workflow">
                {[
                  "Introductions",
                  "NDAs",
                  "Documents",
                  "Offers",
                  "Diligence",
                ].map((capability) => (
                  <li key={capability}>
                    <span aria-hidden="true" />
                    {capability}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="feature-grid">
            {[
              {
                Icon: Handshake,
                title: "Make the right connection",
                text: "Share your acquisition criteria or a confidential business teaser. Focus conversations on opportunities that fit.",
              },
              {
                Icon: FolderLock,
                title: "Share with confidence",
                text: "Keep documents organized by deal. Review NDAs and control each buyer’s access to confidential information.",
              },
              {
                Icon: MessagesSquare,
                title: "Move forward together",
                text: "Bring conversations, indicative offers, diligence requests, and deadlines into a shared transaction workspace.",
              },
            ].map(({ Icon, title, text }, i) => (
              <article className="feature" key={title}>
                <span className="feature-number">0{i + 1}</span>
                <Icon size={28} strokeWidth={1.5} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="for-you" className="audiences">
          <div className="marketing-section">
            <p className="eyebrow">YOUR ROLE. YOUR WORKSPACE.</p>
            <h2>A better process on every side.</h2>
            <div className="audience-grid">
              {[
                {
                  role: "buyer",
                  sectionId: "for-buyers",
                  Icon: BriefcaseBusiness,
                  title: "For buyers",
                  text: "Build a focused pipeline. Review relevant Canadian businesses, request information, and manage diligence with your deal team.",
                  cta: "Find your next acquisition",
                },
                {
                  role: "owner",
                  sectionId: "for-sellers",
                  Icon: Building2,
                  title: "For business owners",
                  text: "Prepare for what comes next. Choose your advisor, control what you share, and keep a clear view of buyer interest and offers.",
                  cta: "Plan your next chapter",
                },
                {
                  role: "advisor",
                  sectionId: "for-advisors",
                  Icon: Handshake,
                  title: "For M&A advisors",
                  text: "Give every mandate a home. Coordinate buyers, organize documents, and keep your clients informed across the entire process.",
                  cta: "Bring your deal team together",
                },
              ].map(({ role, sectionId, Icon, title, text, cta }) => (
                <article id={sectionId} key={role}>
                  <Icon size={25} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <Link href={`/register?role=${role}`}>
                    {cta}
                    <ArrowUpRight size={17} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="process" className="marketing-section">
          <div className="marketing-section-heading">
            <div>
              <p className="eyebrow">FROM FIRST HELLO TO WHAT’S NEXT</p>
              <h2>A clear path through the process.</h2>
              <p className="section-lead">
                A practical four-step workflow designed around how private
                acquisitions actually progress.
              </p>
            </div>
            <div className="section-context">
              <p className="eyebrow">BUILT FOR THE LOWER MIDDLE MARKET</p>
              <p className="market-range">
                <span className="market-range-value">C$1M–C$20M</span>{" "}
                <span className="market-range-label">annual revenue</span>
              </p>
              <p className="section-context-body">
                Purpose-built for established Canadian businesses, acquisition
                buyers, and advisors navigating ownership transitions.
              </p>
            </div>
          </div>
          <ol className="process-grid">
            {[
              [
                "Connect",
                "Create your profile, define your criteria, and start a relevant conversation.",
              ],
              [
                "Qualify",
                "Review interest, exchange NDAs, and approve access on your terms.",
              ],
              [
                "Collaborate",
                "Share documents, discuss offers, and work through diligence together.",
              ],
              [
                "Progress",
                "Keep milestones visible as your team works toward closing.",
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="closing-cta">
          <p className="eyebrow">THE NEXT CHAPTER IS YOURS</p>
          <h2>Let’s make the introduction.</h2>
          <p>
            Create your account and bring your next acquisition or mandate into
            one private workspace.
          </p>
          <Link className="button button-white" href="/register">
            Create your account <ArrowUpRight size={18} />
          </Link>
          <Link className="cta-secondary" href="/login">
            Already have an account? Sign in
          </Link>
        </section>
      </main>
      <footer className="marketing-footer">
        <Brand />
        <p>Connecting the next chapter of Canadian business.</p>
        <span>© {new Date().getFullYear()} Succera</span>
      </footer>
    </>
  );
}
