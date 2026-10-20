import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { pilotCapabilities } from "@/lib/pilot-capabilities";

export default function PublicNetworkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!pilotCapabilities.publicNetwork)
    return (
      <main className="public-network-main">
        <section className="network-empty-state">
          <p className="eyebrow">PRIVATE PILOT</p>
          <h1>Public directory unavailable.</h1>
          <p>
            Succera is focused on private introductions and approved deal rooms
            during the pilot.
          </p>
          <Link className="button button-dark" href="/">
            Return to Succera
          </Link>
        </section>
      </main>
    );
  return (
    <>
      <header className="marketing-header public-network-header">
        <div className="marketing-nav">
          <Brand />
          <nav aria-label="Public network navigation">
            <Link href="/network">The network</Link>
            <Link href="/#platform">The platform</Link>
            <Link href="/about-this-release">About</Link>
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
      <main className="public-network-main">{children}</main>
      <footer className="marketing-footer public-network-footer">
        <Brand />
        <p>Connecting the next chapter of Canadian business.</p>
        <div>
          <Link href="/">Succera home</Link>
          <Link href="/about-this-release">About this release</Link>
          <span>© {new Date().getFullYear()} Succera</span>
        </div>
      </footer>
    </>
  );
}
