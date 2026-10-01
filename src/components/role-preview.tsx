"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Handshake,
  LoaderCircle,
} from "lucide-react";
import type { Role } from "@/lib/types";
import { submitAuth } from "@/lib/client-auth";

const previewRoles = [
  {
    role: "owner",
    label: "Owner",
    description:
      "Inspect sell-side mandates, buyer recommendations, and access.",
    Icon: Building2,
  },
  {
    role: "advisor",
    label: "Advisor",
    description:
      "Inspect advisory workflows, deal teams, and transaction progress.",
    Icon: Handshake,
  },
  {
    role: "buyer",
    label: "Buyer",
    description: "Inspect acquisition projects, opportunities, and diligence.",
    Icon: BriefcaseBusiness,
  },
] as const satisfies ReadonlyArray<{
  role: Role;
  label: string;
  description: string;
  Icon: typeof Building2;
}>;

export function RolePreview() {
  const [busyRole, setBusyRole] = useState<Role>();
  const [error, setError] = useState("");

  async function preview(role: Role) {
    setBusyRole(role);
    setError("");
    try {
      await submitAuth(
        { action: "demo", role },
        "Unable to start role preview.",
      );
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to start role preview.",
      );
      setBusyRole(undefined);
    }
  }

  return (
    <main className="dev-preview-page">
      <div className="dev-preview-shell">
        <Link href="/login" className="dev-preview-back">
          <ArrowLeft size={16} /> Return to Succera sign in
        </Link>

        <header className="dev-preview-header">
          <span>DEV MODE — Role Preview</span>
          <h1>Inspect each workspace without changing a customer account.</h1>
          <p>
            Each action creates a session for the corresponding seeded demo user
            and opens the existing role-aware workspace.
          </p>
        </header>

        {error && (
          <div className="dev-preview-error" role="alert">
            {error}
          </div>
        )}

        <div className="dev-preview-grid">
          {previewRoles.map(({ role, label, description, Icon }) => (
            <section key={role} className="dev-preview-card">
              <Icon size={22} aria-hidden="true" />
              <div>
                <h2>{label}</h2>
                <p>{description}</p>
              </div>
              <button
                type="button"
                disabled={Boolean(busyRole)}
                onClick={() => void preview(role)}
              >
                {busyRole === role ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
                View as {label}
              </button>
            </section>
          ))}
        </div>

        <aside className="dev-preview-note">
          <strong>Development use only.</strong>
          <p>
            Preview sessions use shared fictional data. They do not change the
            role of the currently signed-in user or grant access to customer
            data.
          </p>
        </aside>
      </div>
    </main>
  );
}
