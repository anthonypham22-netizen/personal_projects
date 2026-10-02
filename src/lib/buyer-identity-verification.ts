import "server-only";

import type { DatabaseClient } from "./db";
import { db } from "./db";
import type {
  BuyerCapitalSource,
  BuyerEquityRange,
  BuyerIdentityVerification,
  BuyerIdentityVerificationStatus,
  BuyerIdentityType,
  BuyerVerificationAdminEntry,
  User,
} from "./types";
import { randomUUID } from "node:crypto";

const adminEmails = () =>
  new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const isAdmin = (user: Pick<User, "email">) =>
  adminEmails().has(user.email.trim().toLowerCase());

const normalizeVerification = (
  verification: BuyerIdentityVerification | undefined,
) =>
  verification
    ? {
        ...verification,
        authorized_to_represent: Boolean(verification.authorized_to_represent),
      }
    : undefined;

export async function buyerIdentityVerificationForUser(
  userId: string,
  database: DatabaseClient = db(),
) {
  return normalizeVerification(
    await database
      .prepare("SELECT * FROM buyer_verifications WHERE user_id=?")
      .get<BuyerIdentityVerification>(userId),
  );
}

export async function buyerIdentityIsApproved(
  userId: string,
  database: DatabaseClient = db(),
) {
  return (
    (await database
      .prepare(
        "SELECT 1 FROM buyer_verifications WHERE user_id=? AND status='approved'",
      )
      .get(userId)) !== undefined
  );
}

export async function listBuyerVerificationsForAdmin(
  admin: User,
  database: DatabaseClient = db(),
): Promise<BuyerVerificationAdminEntry[]> {
  if (!isAdmin(admin)) return [];
  const rows = await database
    .prepare(
      `SELECT verification.*,buyer.name buyer_name,buyer.email buyer_email,
         buyer.company buyer_company,buyer.province buyer_province,
         buyer.sectors buyer_sectors,buyer.min_revenue buyer_min_revenue,
         buyer.max_revenue buyer_max_revenue,
         reviewer.name reviewer_name,reviewer.email reviewer_email
       FROM buyer_verifications verification
       JOIN users buyer ON buyer.id=verification.user_id
       LEFT JOIN users reviewer ON reviewer.id=verification.reviewed_by
       WHERE buyer.is_demo=?
       ORDER BY CASE verification.status
         WHEN 'pending' THEN 1 WHEN 'needs_info' THEN 2
         WHEN 'approved' THEN 3 ELSE 4 END,
         verification.submitted_at DESC,verification.updated_at DESC`,
    )
    .all<BuyerVerificationAdminEntry>(admin.is_demo);
  return rows.map((row) =>
    normalizeVerification(row)!,
  ) as BuyerVerificationAdminEntry[];
}

export async function buyerVerificationForAdmin(
  admin: User,
  verificationId: string,
  database: DatabaseClient = db(),
): Promise<BuyerVerificationAdminEntry | undefined> {
  if (!isAdmin(admin)) return undefined;
  const row = await database
    .prepare(
      `SELECT verification.*,buyer.name buyer_name,buyer.email buyer_email,
       buyer.company buyer_company,buyer.province buyer_province,
       buyer.sectors buyer_sectors,buyer.min_revenue buyer_min_revenue,
       buyer.max_revenue buyer_max_revenue,
       reviewer.name reviewer_name,reviewer.email reviewer_email
     FROM buyer_verifications verification
     JOIN users buyer ON buyer.id=verification.user_id
     LEFT JOIN users reviewer ON reviewer.id=verification.reviewed_by
     WHERE verification.id=? AND buyer.is_demo=?`,
    )
    .get<BuyerVerificationAdminEntry>(verificationId, admin.is_demo);
  return normalizeVerification(row) as BuyerVerificationAdminEntry | undefined;
}

export type BuyerVerificationSubmission = {
  buyer_type: BuyerIdentityType;
  linkedin_url: string | null;
  website_url: string | null;
  source_of_capital: BuyerCapitalSource;
  equity_range: BuyerEquityRange;
  completed_acquisitions: number;
  experience_summary: string;
  acquisition_strategy: string;
  authorized_to_represent: true;
};

export async function submitBuyerIdentityVerification(
  user: User,
  submission: BuyerVerificationSubmission,
  database: DatabaseClient = db(),
) {
  const existing = await buyerIdentityVerificationForUser(user.id, database);
  if (existing?.status === "approved") return false;
  await database
    .prepare(
      `INSERT INTO buyer_verifications(
         id,user_id,status,buyer_type,linkedin_url,website_url,
         source_of_capital,equity_range,completed_acquisitions,
         experience_summary,acquisition_strategy,authorized_to_represent,
         submitted_at,reviewed_at,reviewed_by,review_notes
       ) VALUES(?,?,'pending',?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL,NULL,'')
       ON CONFLICT(user_id) DO UPDATE SET
         status='pending',buyer_type=excluded.buyer_type,
         linkedin_url=excluded.linkedin_url,website_url=excluded.website_url,
         source_of_capital=excluded.source_of_capital,
         equity_range=excluded.equity_range,
         completed_acquisitions=excluded.completed_acquisitions,
         experience_summary=excluded.experience_summary,
         acquisition_strategy=excluded.acquisition_strategy,
         authorized_to_represent=excluded.authorized_to_represent,
         submitted_at=CURRENT_TIMESTAMP,reviewed_at=NULL,reviewed_by=NULL,
         review_notes='',updated_at=CURRENT_TIMESTAMP`,
    )
    .run(
      existing?.id ?? randomUUID(),
      user.id,
      submission.buyer_type,
      submission.linkedin_url,
      submission.website_url,
      submission.source_of_capital,
      submission.equity_range,
      submission.completed_acquisitions,
      submission.experience_summary,
      submission.acquisition_strategy,
      submission.authorized_to_represent,
    );
  return true;
}

export async function reviewBuyerIdentityVerification(
  admin: User,
  verificationId: string,
  status: BuyerIdentityVerificationStatus,
  notes: string,
  database: DatabaseClient = db(),
) {
  if (!isAdmin(admin)) return false;
  const result = await database
    .prepare(
      `UPDATE buyer_verifications verification
       SET status=?,review_notes=?,reviewed_at=CURRENT_TIMESTAMP,
         reviewed_by=?,updated_at=CURRENT_TIMESTAMP
       FROM users buyer
       WHERE verification.id=? AND buyer.id=verification.user_id
         AND buyer.is_demo=?`,
    )
    .run(status, notes, admin.id, verificationId, admin.is_demo);
  return result.changes > 0;
}
