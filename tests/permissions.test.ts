import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, one, run } from "../src/lib/db";
import { workspace, mutate, getDeal, canReadDocument, createSession, sessionUser, register, login } from "../src/lib/service";
import type { User, Document } from "../src/lib/types";

let directory: string;
let buyer: User, otherBuyer: User, owner: User, advisor: User;
before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "northlane-permissions-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  db();
  buyer = one<User>("SELECT * FROM users WHERE id='demo-buyer'")!;
  otherBuyer = one<User>("SELECT * FROM users WHERE id='demo-buyer-2'")!;
  owner = one<User>("SELECT * FROM users WHERE id='demo-owner'")!;
  advisor = one<User>("SELECT * FROM users WHERE id='demo-advisor'")!;
});
after(() => { db().close(); rmSync(directory, { recursive: true, force: true }); });

test("buyers receive redacted teasers before confidential approval", () => {
  const state = workspace(buyer);
  const harbour = state.deals.find(d => d.id === "harbour")!;
  assert.equal(harbour.company_name, "Confidential company");
  assert.equal(harbour.confidential_summary, "");
  assert.equal(harbour.city, "");
  assert.equal(harbour.has_access, false);
  assert.equal(state.deals.some(d => d.id === "atlas"), false);
  assert.equal(state.deals.find(d => d.id === "cedar")?.company_name, "Cedar Industrial Services Ltd.");
});

test("document authorization separates buyers and seller-only records", () => {
  const deal = getDeal("cedar");
  const financial = one<Document>("SELECT * FROM documents WHERE id='doc-cedar-fin'")!;
  const internal = one<Document>("SELECT * FROM documents WHERE id='doc-cedar-internal'")!;
  const nda = one<Document>("SELECT * FROM documents WHERE id='doc-cedar-nda'")!;
  assert.equal(canReadDocument(buyer, deal, financial), true);
  assert.equal(canReadDocument(otherBuyer, deal, financial), false);
  assert.equal(canReadDocument(buyer, deal, internal), false);
  assert.equal(canReadDocument(otherBuyer, deal, nda), false);
  assert.equal(canReadDocument(advisor, deal, internal), true);
  assert.equal(workspace(buyer).documents.some(d => d.id === internal.id), false);
});

test("a buyer cannot publish a deal or approve their own access", () => {
  assert.throws(() => mutate(buyer, { action: "updateDeal", data: { deal_id: "harbour", stage: "Closed", published: true } }), /Only/);
  assert.throws(() => mutate(buyer, { action: "reviewAccess", data: { deal_id: "harbour", buyer_id: buyer.id, status: "approved" } }), /Only/);
});

test("approval requires a buyer-specific NDA and an explicit human review", () => {
  assert.throws(() => mutate(advisor, { action: "reviewAccess", data: { deal_id: "cedar", buyer_id: otherBuyer.id, status: "approved", nda_document_id: "doc-cedar-nda", confirm_reviewed: true } }), /this buyer/);
  assert.throws(() => mutate(advisor, { action: "reviewAccess", data: { deal_id: "cedar", buyer_id: buyer.id, status: "approved", nda_document_id: "doc-cedar-nda", confirm_reviewed: "true" } }), /Confirm/);
});

test("buyer conversations, offers and internal tasks do not cross parties", () => {
  const state = workspace(otherBuyer);
  assert.equal(state.messages.some(m => m.buyer_id === buyer.id), false);
  assert.equal(state.offers.length, 0);
  assert.equal(state.tasks.some(t => t.buyer_id !== otherBuyer.id), false);
  assert.throws(() => mutate(otherBuyer, { action: "message", data: { deal_id: "cedar", buyer_id: buyer.id, body: "Unauthorized" } }), /cannot access/);
  assert.throws(() => mutate(buyer, { action: "toggleTask", data: { deal_id: "summit", task_id: "task-3" } }), /not available/);
});

test("revocation immediately removes confidential data and document access", () => {
  mutate(advisor, { action: "reviewAccess", data: { deal_id: "cedar", buyer_id: buyer.id, status: "revoked" } });
  assert.equal(workspace(buyer).deals.find(d => d.id === "cedar")?.has_access, false);
  assert.equal(workspace(buyer).documents.some(d => d.deal_id === "cedar"), false);
  assert.throws(() => mutate(buyer, { action: "message", data: { deal_id: "cedar", buyer_id: buyer.id, body: "No longer allowed" } }), /cannot access/);
  mutate(advisor, { action: "reviewAccess", data: { deal_id: "cedar", buyer_id: buyer.id, status: "approved", nda_document_id: "doc-cedar-nda", confirm_reviewed: true } });
});

test("a linked owner and appointed advisor share the same mandate", () => {
  const result = mutate(advisor, { action: "createDeal", data: { title: "Project Test", company_name: "Test Company", sector: "Manufacturing", province: "Ontario", city: "Ottawa", revenue: 2000000, ebitda: 300000, asking_price: 1800000, employees: 12, founded: 2010, description: "A fictional business created for a permission test.", confidential_summary: "Confidential test description" } });
  const dealId = result.id!;
  mutate(advisor, { action: "connectOwner", data: { deal_id: dealId, email: owner.email, confirm_authority: true } });
  assert.equal(getDeal(dealId).owner_id, owner.id);
  assert.equal(workspace(owner).deals.find(d => d.id === dealId)?.can_manage, true);
  assert.equal(workspace(advisor).deals.find(d => d.id === dealId)?.can_manage, true);
  assert.equal(workspace(buyer).deals.some(d => d.id === dealId), false);
});

test("real accounts cannot discover or mutate demonstration deals", () => {
  const token = register({ name: "Real Buyer", company: "Real Account Inc.", email: "real@example.test", role: "buyer", password: "  exact-password-2026  " });
  const user = sessionUser(token)!;
  assert.equal(workspace(user).deals.length, 0);
  assert.throws(() => mutate(user, { action: "requestAccess", data: { deal_id: "maple" } }), /not available/);
  assert.ok(login({ email: "real@example.test", password: "  exact-password-2026  " }));
  assert.throws(() => login({ email: "real@example.test", password: "exact-password-2026" }), /incorrect/);
});

test("demo buyers can preview a published real teaser without crossing the confidential boundary", () => {
  const token = register({ name: "Preview Owner", company: "Preview Owner Inc.", email: "preview-owner@example.test", role: "owner", password: "preview-password-2026" });
  const realOwner = sessionUser(token)!;
  const advisorToken = register({ name: "Preview Advisor", company: "Preview Advisory Inc.", email: "preview-advisor@example.test", role: "advisor", password: "preview-password-2026" });
  const realAdvisor = sessionUser(advisorToken)!;
  const created = mutate(realOwner, { action: "createDeal", data: { title: "Project Preview", company_name: "Preview Owner Inc.", sector: "Manufacturing", province: "Ontario", city: "Toronto", revenue: 3000000, ebitda: 500000, asking_price: 4000000, employees: 20, founded: 2012, description: "A fictional Ontario manufacturer used to verify published buyer previews.", confidential_summary: "This must remain hidden from the shared demo buyer." } });
  const dealId = created.id!;
  mutate(realOwner, { action: "appointAdvisor", data: { deal_id: dealId, advisor_id: realAdvisor.id } });
  assert.equal(workspace(buyer).deals.some(deal => deal.id === dealId), false, "an unpublished real listing must remain hidden from the demo buyer");
  mutate(realOwner, { action: "updateDeal", data: { deal_id: dealId, stage: "On market", published: true } });

  run("INSERT INTO access(id,deal_id,buyer_id,status) VALUES(?,?,?,'approved')","cross-realm-preview",dealId,buyer.id);
  run("INSERT INTO documents(id,deal_id,name,storage_key,mime,category,size,audience,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)","cross-realm-doc",dealId,"Imported financials.txt","cross-realm-doc.txt","text/plain","Financials",20,"approved",realOwner.id);
  run("INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)","cross-realm-message",dealId,buyer.id,realOwner.id,"This imported conversation must remain hidden.");
  run("INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)","cross-realm-task",dealId,"Imported diligence task","2026-12-31",buyer.id,realOwner.id);
  run("INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)","cross-realm-offer",dealId,buyer.id,3500000,"Asset purchase","Imported offer","cross-realm-doc");
  run("INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)","cross-realm-activity",dealId,buyer.id,"Imported activity");

  const state = workspace(buyer);
  const preview = state.deals.find(deal => deal.id === dealId);
  assert.ok(preview, "the published real teaser should appear for the demo buyer");
  assert.equal(preview.preview_only, true);
  assert.equal(preview.has_access, false);
  assert.equal(preview.access_status, "none");
  assert.equal(preview.company_name, "Confidential company");
  assert.equal(preview.city, "");
  assert.equal(preview.employees, 0);
  assert.equal(preview.founded, 0);
  assert.equal(preview.confidential_summary, "");
  assert.equal(preview.owner_id, "");
  assert.equal(preview.advisor_id, null);
  assert.equal(state.advisors.some(advisor => advisor.id === realAdvisor.id), true, "the advisor directory can remain available without linking it to this preview");
  assert.equal(state.access.some(access => access.deal_id === dealId), false);
  assert.equal(state.documents.some(document => document.deal_id === dealId), false);
  assert.equal(state.messages.some(message => message.deal_id === dealId), false);
  assert.equal(state.tasks.some(task => task.deal_id === dealId), false);
  assert.equal(state.offers.some(offer => offer.deal_id === dealId), false);
  assert.equal(state.activity.some(activity => activity.deal_id === dealId), false);
  assert.throws(() => mutate(buyer, { action: "requestAccess", data: { deal_id: dealId, notes: "Shared demo accounts stay read-only." } }), /not available/);
});

test("disabled demo mode invalidates existing demo sessions", () => {
  const token = createSession(buyer.id);
  assert.equal(sessionUser(token)?.id, buyer.id);
  process.env.ALLOW_DEMO = "false";
  assert.equal(sessionUser(token), undefined);
  process.env.ALLOW_DEMO = "true";
});

test("expired sessions are rejected", () => {
  const token = createSession(owner.id);
  run("UPDATE sessions SET expires_at=0 WHERE user_id=?", owner.id);
  assert.equal(sessionUser(token), undefined);
});
