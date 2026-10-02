"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

export function BuyerVerificationDecisionForm({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        try {
          const response = await fetch(`/api/admin/buyer-verifications/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
          const result = (await response.json()) as {
            message?: string;
            error?: string;
          };
          if (!response.ok)
            throw new Error(result.error || "Unable to save the decision.");
          setMessage(result.message || "Decision saved.");
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to save the decision.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Decision
          <select name="status" defaultValue="approved">
            <option value="approved">Approve buyer</option>
            <option value="needs_info">Request more information</option>
            <option value="rejected">Reject verification</option>
          </select>
        </label>
        <label className="full">
          Review note
          <textarea
            name="notes"
            maxLength={5000}
            placeholder="Required when requesting information or rejecting. Visible to the buyer."
          />
        </label>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-green" disabled={busy}>
          {busy ? <LoaderCircle size={16} /> : <Check size={16} />} Save
          decision
        </button>
      </div>
    </form>
  );
}
