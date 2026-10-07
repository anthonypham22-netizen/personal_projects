"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, LoaderCircle, X } from "lucide-react";

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
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const values = Object.fromEntries(new FormData(form));
        const action = submitter?.getAttribute("value");
        try {
          const response = await fetch(`/api/admin/buyer-verifications/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...values, action }),
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
        <button
          className="button button-green"
          disabled={busy}
          type="submit"
          value="approve"
        >
          {busy ? <LoaderCircle size={16} /> : <Check size={16} />} Approve
        </button>
        <button
          className="button button-quiet"
          disabled={busy}
          type="submit"
          value="request_more_information"
        >
          <CircleHelp size={16} /> Request more information
        </button>
        <button
          className="button button-quiet admin-reject-button"
          disabled={busy}
          type="submit"
          value="reject"
        >
          <X size={16} /> Reject
        </button>
      </div>
    </form>
  );
}
