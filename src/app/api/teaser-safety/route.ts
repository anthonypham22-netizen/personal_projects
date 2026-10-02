import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db, type DatabaseClient } from "@/lib/db";
import { checkOrigin, failure, jsonBody } from "@/lib/http";
import { AppError, audit, getDeal, limit, requireManager } from "@/lib/service";
import { inTransaction } from "@/lib/transaction";
import {
  analyzeTeaserSafety,
  teaserSafetyReviewInputDigest,
  type TeaserSafetyReviewInput,
} from "@/lib/teaser-safety";
import { configuredTeaserSafetyProvider } from "@/lib/teaser-safety-provider";
import type { TeaserSafetyReview } from "@/lib/types";

export const runtime = "nodejs";

const unavailableMandate = () =>
  new AppError("This mandate is not available.", 404);

const managedDealOrNotFound = async (
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  dealId: string,
) => {
  try {
    const deal = await getDeal(dealId);
    await requireManager(user, deal);
    return deal;
  } catch (error) {
    if (error instanceof AppError && [403, 404].includes(error.status))
      throw unavailableMandate();
    throw error;
  }
};

const managedDealInTransactionOrNotFound = async (
  database: DatabaseClient,
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  dealId: string,
) => {
  const deal = (await database
    .prepare("SELECT * FROM deals WHERE id=?")
    .get(dealId)) as Awaited<ReturnType<typeof getDeal>> | undefined;
  if (!deal || user.role === "buyer") throw unavailableMandate();
  const legacyManager =
    (!deal.owner_organization_id && deal.owner_id === user.id) ||
    (!deal.advisor_organization_id && deal.advisor_id === user.id);
  const membership = await database
    .prepare(
      `SELECT role FROM organization_members
       WHERE user_id=? AND status='active' AND organization_id IN (?,?)
         AND role IN ('owner','admin','member')
       LIMIT 1`,
    )
    .get(
      user.id,
      deal.owner_organization_id || "",
      deal.advisor_organization_id || "",
    );
  if (!legacyManager && !membership) throw unavailableMandate();
  return deal;
};

const reviewInputForDeal = async (
  database: ReturnType<typeof db>,
  deal: Awaited<ReturnType<typeof getDeal>>,
): Promise<TeaserSafetyReviewInput> => {
  const historicalFinancialPeriods = (
    (await database
      .prepare(
        "SELECT COUNT(*) count FROM deal_financials WHERE deal_id=? AND is_projected=0",
      )
      .get(deal.id)) as { count: number }
  ).count;
  return {
    companyName: deal.company_name,
    sector: deal.sector,
    province: deal.province,
    city: deal.city,
    revenue: deal.revenue,
    ebitda: deal.ebitda,
    askingPrice: deal.asking_price,
    employees: deal.employees,
    founded: deal.founded,
    transactionType: deal.transaction_type,
    ownershipPercentageAvailable: deal.ownership_percentage_available,
    sellerRolloverPossible: Boolean(deal.seller_rollover_possible),
    description: deal.description,
    historicalFinancialPeriods,
  };
};

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    const parsed = z
      .object({ deal_id: z.string().trim().min(1).max(100) })
      .safeParse(await jsonBody(request));
    if (!parsed.success) throw new AppError("A valid mandate is required.");
    limit(`teaser-safety:${user.id}`, 20, 60);
    const deal = await managedDealOrNotFound(user, parsed.data.deal_id);
    const provider = configuredTeaserSafetyProvider();
    if (!provider)
      throw new AppError(
        "No approved teaser safety provider is configured.",
        503,
      );
    const database = db();
    const analysis = await analyzeTeaserSafety(
      await reviewInputForDeal(database, deal),
      provider,
    );
    const id = randomUUID();
    let persistedDeal = deal;
    await inTransaction(database, async (transaction) => {
      persistedDeal = await managedDealInTransactionOrNotFound(
        transaction,
        user,
        deal.id,
      );
      const currentInput = await reviewInputForDeal(transaction, persistedDeal);
      if (teaserSafetyReviewInputDigest(currentInput) !== analysis.inputSha256)
        throw new AppError(
          "The mandate changed during this review. Run the safety review again.",
          409,
        );
      await transaction
        .prepare(
          `INSERT INTO teaser_safety_reviews(
            id,deal_id,requested_by_user_id,provider,provider_name,
            external_data_processing,input_sha256,status,findings_json,
            suggested_teaser,investment_highlights_json,missing_financials_json
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          persistedDeal.id,
          user.id,
          analysis.provider,
          analysis.providerName,
          analysis.externalDataProcessing ? 1 : 0,
          analysis.inputSha256,
          analysis.status,
          JSON.stringify(analysis.findings),
          analysis.suggestedTeaser,
          JSON.stringify(analysis.investmentHighlights),
          JSON.stringify(analysis.missingFinancials),
        );
    });
    await audit(user, persistedDeal.id, "Ran a teaser safety review");
    const review: TeaserSafetyReview = {
      id,
      deal_id: persistedDeal.id,
      requested_by_user_id: user.id,
      requested_by_name: user.name,
      provider: analysis.provider,
      provider_name: analysis.providerName,
      external_data_processing: analysis.externalDataProcessing,
      input_sha256: analysis.inputSha256,
      status: analysis.status,
      findings: analysis.findings,
      suggested_teaser: analysis.suggestedTeaser,
      investment_highlights: analysis.investmentHighlights,
      missing_financials: analysis.missingFinancials,
      applied_at: null,
      applied_by_user_id: null,
      created_at: new Date().toISOString(),
    };
    return NextResponse.json(
      {
        message:
          "Safety review complete. Review the findings and suggested draft before applying anything.",
        review,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
