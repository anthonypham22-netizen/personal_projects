import { test, expect } from "@playwright/test";

test("seeded demo supports access review, buyer questions and indicative offer review", async ({ browser, baseURL }) => {
  const origin = baseURL || "http://localhost:3000";
  const buyer = await browser.newContext({ baseURL: origin });
  const advisor = await browser.newContext({ baseURL: origin });
  const headers = { Origin: origin };
  const review = (status: string, extra: Record<string, unknown> = {}) => advisor.request.post("/api/workspace", {
    headers, data: { action: "reviewAccess", data: { deal_id: "cedar", buyer_id: "demo-buyer", status, ...extra } },
  });
  try {
    expect((await buyer.request.post("/api/auth", { headers, data: { action: "demo", role: "buyer" } })).ok()).toBe(true);
    expect((await advisor.request.post("/api/auth", { headers, data: { action: "demo", role: "advisor" } })).ok()).toBe(true);
    expect((await review("revoked")).ok()).toBe(true);
    expect((await buyer.request.get("/api/documents/doc-cedar-fin")).status()).toBe(404);
    expect((await review("approved", { nda_document_id: "doc-cedar-nda" })).status()).toBe(400);
    // Simulated review of the seeded fixture only; no legal agreement is executed.
    expect((await review("approved", { nda_document_id: "doc-cedar-nda", confirm_reviewed: true })).ok()).toBe(true);
    expect((await buyer.request.get("/api/documents/doc-cedar-fin")).status()).toBe(200);
    expect((await buyer.request.get("/api/documents/doc-cedar-internal")).status()).toBe(404);
    const note = `Fictional workflow test ${Date.now()}`;
    const body = `${note}: please explain the earnings adjustment bridge.`;
    expect((await buyer.request.post("/api/workspace", { headers, data: { action: "message", data: { deal_id: "cedar", buyer_id: "demo-buyer", body } } })).ok()).toBe(true);
    let advisorData = await (await advisor.request.get("/api/workspace")).json();
    expect(advisorData.messages.some((message: { body: string }) => message.body === body)).toBe(true);
    expect((await buyer.request.post("/api/workspace", { headers, data: { action: "submitOffer", data: { deal_id: "summit", amount: 13200000, structure: "Share purchase", notes: note, document_id: "doc-summit-loi" } } })).ok()).toBe(true);
    advisorData = await (await advisor.request.get("/api/workspace")).json();
    const offer = advisorData.offers.find((entry: { notes: string }) => entry.notes === note);
    expect(offer).toBeTruthy();
    const reviewed = await advisor.request.post("/api/workspace", { headers, data: { action: "reviewOffer", data: { deal_id: "summit", offer_id: offer.id, status: "Shortlisted" } } });
    expect(reviewed.ok()).toBe(true);
    expect((await reviewed.json()).message).toContain("does not execute or accept a legal agreement");
  } finally {
    await review("approved", { nda_document_id: "doc-cedar-nda", confirm_reviewed: true });
    await buyer.close();
    await advisor.close();
  }
});
