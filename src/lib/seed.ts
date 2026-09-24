import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "./passwords.ts";

type DemoDocument = {
  id: string;
  deal: string;
  name: string;
  category: string;
  audience: "team" | "approved" | "buyer";
  buyer: string | null;
  uploader: string;
  content: string;
};

const sampleHeader = (title: string, project: string) =>
  `SUCCERA | ${project.toUpperCase()}\n${title}\nSAMPLE TRANSACTION DOCUMENT — NOT FOR RELIANCE\nPrepared for product demonstration only | 15 September 2026\n\nAll companies, people, financial figures, signatures, and transaction terms in this document are invented. This is not an executed agreement, an offer, legal advice, accounting advice, or investment advice.\n\n`;

const demoDocuments: readonly DemoDocument[] = [
  {
    id: "doc-cedar-fin",
    deal: "cedar",
    name: "FY2025 financial overview.txt",
    category: "Financials",
    audience: "approved",
    buyer: null,
    uploader: "demo-advisor",
    content:
      sampleHeader("FY2025 FINANCIAL OVERVIEW", "Project Cedar") +
      `Reporting period: Year ended 31 December 2025\nCurrency: Canadian dollars (C$000s), unaudited management reporting\n\nINCOME STATEMENT SUMMARY\n                                      FY2023   FY2024   FY2025\nRevenue                                7,120    7,760    8,400\nCost of services                       4,190    4,480    4,710\nGross profit                           2,930    3,280    3,690\nOperating expenses                     1,520    1,650    1,890\nAdjusted EBITDA                        1,410    1,630    1,800\nAdjusted EBITDA margin                 19.8%    21.0%    21.4%\nCapital expenditures                     310      360      420\n\nRevenue by service line — FY2025\nPreventive maintenance                  4,116     49%\nInspection and compliance               2,268     27%\nEmergency and project work              2,016     24%\n\nSelected operating indicators\nRecurring or contracted revenue: 72%\nTop customer concentration: 14% of revenue\nTop five customers: 38% of revenue\nEmployees at year end: 42\nAverage customer tenure: 7.4 years\n\nADJUSTED EBITDA RECONCILIATION — FY2025\nReported operating income: C$1,615\nAdd: owner compensation above market: C$110\nAdd: one-time ERP implementation: C$48\nAdd: transaction preparation costs: C$27\nAdjusted EBITDA: C$1,800\n\nManagement notes\nRevenue growth reflects two multi-site contract wins and price increases averaging 3.5%. Gross margin improved through technician scheduling and purchasing discipline. Working capital is seasonal, with receivables typically peaking in November and December. Buyers should reconcile this summary to source records and complete independent financial, tax, quality-of-earnings, customer, and working-capital diligence.\n`,
  },
  {
    id: "doc-cedar-cim",
    deal: "cedar",
    name: "Confidential information memorandum.txt",
    category: "Company overview",
    audience: "approved",
    buyer: null,
    uploader: "demo-advisor",
    content:
      sampleHeader("CONFIDENTIAL INFORMATION MEMORANDUM", "Project Cedar") +
      `Opportunity: Acquisition of a Canadian industrial maintenance and inspection services provider\nHead office: Hamilton, Ontario\nFounded: 2004\nEmployees: 42\nFY2025 revenue: C$8.4 million\nFY2025 adjusted EBITDA: C$1.8 million\n\nEXECUTIVE SUMMARY\nCedar Industrial Services Ltd. provides planned maintenance, inspection, and emergency field services to industrial and commercial facilities across Southern Ontario. The company has built recurring relationships with facility managers who value technician responsiveness, compliance documentation, and continuity of service. The founder is seeking a succession partner and is prepared to support an orderly transition.\n\nINVESTMENT HIGHLIGHTS\n• 72% recurring or contracted FY2025 revenue.\n• Diversified customer base; no customer exceeds 14% of revenue.\n• Experienced operations manager and service coordinators oversee daily scheduling.\n• Documented safety program and technician certification calendar.\n• Organic growth opportunities in adjacent Ontario markets and cross-selling inspections.\n\nBUSINESS MODEL\nCustomers are served under annual preventive-maintenance agreements, scheduled inspection engagements, and time-and-material emergency work. Pricing is based on technician category, service window, travel zone, and parts consumed. Contracts generally renew annually and do not include guaranteed minimum volumes unless specifically stated.\n\nCUSTOMERS AND MARKET\nThe company serves light manufacturing, logistics, commercial property, and infrastructure-related customers. FY2025 revenue concentration was 14% for the largest customer and 38% for the five largest. The company competes primarily on response time, documentation quality, and technician experience rather than lowest price.\n\nOPERATIONS\nThe business operates from a leased Hamilton facility. Field work is coordinated through a cloud scheduling system. Vehicles and specialized tools are owned or financed. A detailed employee census, asset register, insurance summary, customer cohort analysis, and lease schedule would ordinarily be provided during diligence.\n\nTRANSACTION RATIONALE AND PROCESS\nThe shareholder is exploring a sale of the company and prefers a buyer that will retain employees and preserve customer relationships. Any transaction is subject to satisfactory diligence, definitive agreements, financing, third-party consents, and shareholder approval. Recipients must form their own view of value and risk; no forecast or statement in this sample is a representation or warranty.\n`,
  },
  {
    id: "doc-cedar-nda",
    deal: "cedar",
    name: "Mutual NDA — sample.txt",
    category: "NDA",
    audience: "buyer",
    buyer: "demo-buyer",
    uploader: "demo-advisor",
    content:
      sampleHeader("MUTUAL NON-DISCLOSURE AGREEMENT", "Project Cedar") +
      `Sample parties: Cedar Industrial Services Ltd. (the “Company”) and Evergreen Capital Inc. (the “Recipient”)\nSample effective date: 3 September 2026\n\n1. Purpose\nThe parties wish to evaluate a possible negotiated acquisition involving the Company (the “Transaction”). Each party may disclose non-public information solely for evaluating, negotiating, financing, or completing the Transaction.\n\n2. Confidential Information\n“Confidential Information” means non-public business, financial, commercial, technical, employee, customer, supplier, and transaction information disclosed in any form, including the existence and status of discussions. It excludes information the receiving party can demonstrate was lawfully known without restriction, becomes public without breach, is received lawfully from another source, or is independently developed without use of Confidential Information.\n\n3. Use and Permitted Representatives\nA receiving party will use Confidential Information only for the Purpose and may share it only with directors, officers, employees, professional advisers, financing sources, and prospective equity partners who need to know it and are bound by confidentiality obligations. The receiving party remains responsible for breaches by its Representatives.\n\n4. Required Disclosure\nIf disclosure is required by law, regulation, or court order, the receiving party will, where legally permitted, give prompt notice and reasonable assistance so the disclosing party may seek protective treatment. Only the legally required portion may be disclosed.\n\n5. No Contact and No Reliance\nWithout written consent, the Recipient will not contact employees, customers, or suppliers regarding the Transaction. Information is provided without representation or warranty except as may be set out in a signed definitive agreement.\n\n6. Return or Destruction\nOn request, the receiving party will return or destroy Confidential Information, subject to routine backup systems and legal or professional retention requirements that remain confidential.\n\n7. Term and Remedies\nThese obligations continue for two years after the Effective Date. Unauthorized disclosure may cause irreparable harm for which damages may be inadequate, without limiting other remedies.\n\n8. Governing Law\nThis sample is stated to be governed by the laws of Ontario and the federal laws of Canada applicable there. The parties submit to the courts located in Toronto, Ontario.\n\nSAMPLE EXECUTION BLOCK — NO SIGNATURES\nCedar Industrial Services Ltd.                Evergreen Capital Inc.\nName: Jamie Chen                              Name: Taylor Reid\nTitle: President                              Title: Managing Director\nDate: 3 September 2026                        Date: 3 September 2026\n\nThis sample must be reviewed and adapted by qualified Canadian legal counsel before any real use.\n`,
  },
  {
    id: "doc-summit-fin",
    deal: "summit",
    name: "FY2025 financial overview.txt",
    category: "Financials",
    audience: "approved",
    buyer: null,
    uploader: "demo-advisor",
    content:
      sampleHeader("FY2025 FINANCIAL OVERVIEW", "Project Summit") +
      `Reporting period: Year ended 31 December 2025\nCurrency: Canadian dollars (C$000s), unaudited management reporting\n\nINCOME STATEMENT SUMMARY\n                                      FY2023   FY2024   FY2025\nRevenue                               10,480   11,370   12,600\nGross profit                           3,210    3,590    4,095\nAdjusted EBITDA                        1,760    2,010    2,400\nAdjusted EBITDA margin                 16.8%    17.7%    19.0%\nCapital expenditures                     640      710      825\n\nRevenue by end market — FY2025\nEnergy and utilities                    4,410     35%\nInfrastructure                          3,276     26%\nIndustrial equipment                    2,898     23%\nOther                                   2,016     16%\n\nSelected operating indicators\nBacklog at 31 December 2025: C$4.8 million\nTop customer concentration: 17%\nOn-time delivery: 94%\nEmployees: 68\nFacility: 38,000 square feet, leased\n\nBALANCE-SHEET HIGHLIGHTS — FY2025\nAccounts receivable: C$2,140\nInventory: C$1,380\nAccounts payable: C$1,160\nNet working capital: C$2,360\nEquipment finance obligations: C$1,050\n\nManagement notes\nMargin expansion reflects improved machine utilization, selective pricing, and lower overtime. The backlog figure includes customer purchase orders that may be changed or cancelled under their terms. Normalized working capital, equipment condition, maintenance capital expenditure, environmental matters, customer concentration, and backlog conversion require independent diligence.\n`,
  },
  {
    id: "doc-summit-loi",
    deal: "summit",
    name: "Indicative letter of intent.txt",
    category: "LOI",
    audience: "buyer",
    buyer: "demo-buyer",
    uploader: "demo-buyer",
    content:
      sampleHeader("INDICATIVE LETTER OF INTENT", "Project Summit") +
      `Sample date: 12 September 2026\nFrom: Evergreen Capital Inc.\nTo: The shareholder of Summit Precision Manufacturing Inc.\n\nThis letter summarizes the principal terms on which Evergreen Capital Inc. (“Buyer”) would be prepared to pursue a transaction involving Summit Precision Manufacturing Inc. (“Company”). Except for the sections expressly identified as binding, this letter is non-binding and subject to diligence and definitive agreements.\n\n1. Proposed Transaction\nBuyer proposes to acquire all issued and outstanding shares of the Company on a cash-free, debt-free basis, with a normalized level of working capital delivered at closing.\n\n2. Proposed Purchase Price\nIndicative enterprise value: C$13,200,000. The equity purchase price would be adjusted for cash, debt, debt-like items, unpaid transaction expenses, and the difference between delivered and normalized working capital.\n\n3. Consideration\nC$11,880,000 payable in cash at closing and C$1,320,000 held in escrow for 18 months to support customary indemnification obligations. The parties may discuss a vendor note or rollover investment, but neither is required by this proposal.\n\n4. Diligence and Conditions\nThe proposal is subject to satisfactory financial, tax, legal, commercial, operational, environmental, cybersecurity, insurance, human-resources, and quality-of-earnings diligence; approval by Buyer’s investment committee; committed financing; material third-party consents; and negotiation of definitive agreements.\n\n5. Management and Employees\nBuyer intends to retain the existing management team and employees on terms to be discussed. Buyer requests reasonable transition assistance from the shareholder for up to six months after closing under a separate agreement.\n\n6. Timing\nBuyer proposes four weeks for confirmatory diligence and two additional weeks to finalize definitive agreements, targeting closing within 45 days after acceptance of this letter.\n\n7. Exclusivity — Sample Binding Provision\nFor 45 days after acceptance, the Company and shareholder would not solicit, encourage, negotiate, or enter into an alternative acquisition proposal, subject to terms in a mutually acceptable exclusivity agreement.\n\n8. Confidentiality, Costs, and Governing Law — Sample Binding Provisions\nThe parties remain bound by their confidentiality agreement. Each party bears its own costs. These binding provisions are stated to be governed by Ontario law. No other section creates a legal obligation to complete a transaction.\n\nSAMPLE ACKNOWLEDGEMENT — NOT SIGNED\nEvergreen Capital Inc.                         Shareholder\nTaylor Reid, Managing Director                 Jamie Chen, President\n\nQualified legal, tax, accounting, and financial advisers must review any real letter of intent.\n`,
  },
  {
    id: "doc-cedar-internal",
    deal: "cedar",
    name: "Seller process strategy memo.txt",
    category: "Other",
    audience: "team",
    buyer: null,
    uploader: "demo-advisor",
    content:
      sampleHeader("SELLER PROCESS STRATEGY MEMO", "Project Cedar") +
      `Audience: Owner and appointed M&A adviser only\nStatus: Working draft\n\nOBJECTIVES\n1. Identify a well-capitalized successor that will retain the Hamilton operation and core employee base.\n2. Preserve confidentiality until buyer credibility and strategic fit are established.\n3. Achieve a fair value while balancing certainty, employee continuity, and the founder’s preferred transition role.\n\nPROPOSED PROCESS\nWeek 1: Finalize anonymous teaser, buyer universe, NDA form, and management financial package.\nWeeks 2–3: Contact priority strategic and financial buyers; log interest and conflicts.\nWeeks 3–5: Execute NDAs, release the CIM, and hold adviser calls.\nWeeks 5–6: Management presentations and controlled Q&A.\nWeek 7: Request written LOIs using a common instruction letter.\nWeek 8: Compare value, structure, financing, conditions, transition expectations, and closing risk.\n\nBUYER EVALUATION SCORECARD\n• Indicative enterprise value and working-capital approach — 30%\n• Financing evidence and transaction certainty — 25%\n• Employee and customer continuity — 20%\n• Relevant operating experience — 15%\n• Diligence burden and proposed timeline — 10%\n\nKEY PREPARATION ITEMS\nReconcile FY2023–FY2025 management accounts to tax filings; document EBITDA adjustments; prepare monthly working-capital analysis; complete customer revenue and retention cohorts; assemble employee census and contractor schedule; review change-of-control clauses; confirm leased-premises renewal options; prepare safety, insurance, privacy, and litigation summaries.\n\nKNOWN DISCUSSION POINTS\nThe largest customer represents 14% of FY2025 revenue. Two fleet vehicles require replacement within 18 months. The founder currently owns the operating facility through a related company; proposed lease or real-estate treatment must be settled before final bids.\n\nCONFIDENTIALITY CONTROLS\nUse code names in early outreach. Do not identify customers or employees in the teaser. Release customer names only to shortlisted buyers. All data-room access should be buyer-specific, time-limited, and revoked when a party exits the process.\n\nThis memo is an invented product sample, not a recommendation for a real sale process.\n`,
  },
];

function syncDemoDocuments(d: DatabaseSync, directory: string) {
  mkdirSync(path.join(directory, "uploads"), { recursive: true, mode: 0o700 });
  const upsert =
    d.prepare(`INSERT INTO documents(id,deal_id,name,storage_key,mime,category,size,audience,buyer_id,uploaded_by)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,mime=excluded.mime,category=excluded.category,size=excluded.size,audience=excluded.audience,buyer_id=excluded.buyer_id,uploaded_by=excluded.uploaded_by`);
  for (const document of demoDocuments) {
    writeFileSync(
      path.join(directory, "uploads", document.id),
      document.content,
      { mode: 0o600 },
    );
    upsert.run(
      document.id,
      document.deal,
      document.name,
      document.id,
      "text/plain",
      document.category,
      Buffer.byteLength(document.content),
      document.audience,
      document.buyer,
      document.uploader,
    );
  }
}

const demoBuyerProjects = [
  {
    id: "buyer-project-maple",
    name: "Project Maple",
    status: "active",
    thesis:
      "Acquire Canadian vertical software businesses with C$5M-C$20M revenue and durable recurring revenue.",
    min_revenue: 5_000_000,
    max_revenue: 20_000_000,
    min_ebitda: 1_000_000,
    max_ebitda: 5_000_000,
    min_ebitda_margin: 15,
    max_ebitda_margin: 35,
    min_enterprise_value: 15_000_000,
    max_enterprise_value: 80_000_000,
    min_equity_check: 5_000_000,
    max_equity_check: 30_000_000,
    ownership_preference: "100_percent",
    transaction_type: "full_acquisition",
    sectors: ["Technology"],
    provinces: ["Ontario", "Québec"],
    keywords: ["vertical SaaS", "recurring revenue", "founder transition"],
  },
  {
    id: "buyer-project-northern-lights",
    name: "Project Northern Lights",
    status: "active",
    thesis:
      "Acquire HVAC and field-service companies in Ontario and Alberta with a strong contracted maintenance base.",
    min_revenue: 3_000_000,
    max_revenue: 10_000_000,
    min_ebitda: 500_000,
    max_ebitda: 2_000_000,
    min_ebitda_margin: 10,
    max_ebitda_margin: 30,
    min_enterprise_value: 8_000_000,
    max_enterprise_value: 35_000_000,
    min_equity_check: 2_000_000,
    max_equity_check: 15_000_000,
    ownership_preference: "majority",
    transaction_type: "majority_acquisition",
    sectors: ["Business services", "Construction"],
    provinces: ["Ontario", "Alberta"],
    keywords: ["HVAC", "maintenance", "recurring contracts"],
  },
] as const;

function syncDemoBuyerProjects(d: DatabaseSync) {
  const tableExists = d
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='buyer_projects'",
    )
    .get();
  if (!tableExists) return;

  const upsert = d.prepare(`
    INSERT INTO buyer_projects(
      id,organization_id,created_by_user_id,name,status,thesis,
      min_revenue,max_revenue,min_ebitda,max_ebitda,min_ebitda_margin,max_ebitda_margin,
      min_enterprise_value,max_enterprise_value,min_equity_check,max_equity_check,
      ownership_preference,transaction_type
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      organization_id=excluded.organization_id,
      created_by_user_id=excluded.created_by_user_id,
      name=excluded.name,
      status=excluded.status,
      thesis=excluded.thesis,
      min_revenue=excluded.min_revenue,
      max_revenue=excluded.max_revenue,
      min_ebitda=excluded.min_ebitda,
      max_ebitda=excluded.max_ebitda,
      min_ebitda_margin=excluded.min_ebitda_margin,
      max_ebitda_margin=excluded.max_ebitda_margin,
      min_enterprise_value=excluded.min_enterprise_value,
      max_enterprise_value=excluded.max_enterprise_value,
      min_equity_check=excluded.min_equity_check,
      max_equity_check=excluded.max_equity_check,
      ownership_preference=excluded.ownership_preference,
      transaction_type=excluded.transaction_type,
      updated_at=CURRENT_TIMESTAMP
  `);
  const deleteSectors = d.prepare(
    "DELETE FROM buyer_project_sectors WHERE buyer_project_id=?",
  );
  const deleteProvinces = d.prepare(
    "DELETE FROM buyer_project_provinces WHERE buyer_project_id=?",
  );
  const deleteKeywords = d.prepare(
    "DELETE FROM buyer_project_keywords WHERE buyer_project_id=?",
  );
  const insertSector = d.prepare(
    "INSERT INTO buyer_project_sectors(id,buyer_project_id,sector) VALUES(?,?,?)",
  );
  const insertProvince = d.prepare(
    "INSERT INTO buyer_project_provinces(id,buyer_project_id,province) VALUES(?,?,?)",
  );
  const insertKeyword = d.prepare(
    "INSERT INTO buyer_project_keywords(id,buyer_project_id,keyword) VALUES(?,?,?)",
  );

  for (const project of demoBuyerProjects) {
    upsert.run(
      project.id,
      "org-demo-buyer",
      "demo-buyer",
      project.name,
      project.status,
      project.thesis,
      project.min_revenue,
      project.max_revenue,
      project.min_ebitda,
      project.max_ebitda,
      project.min_ebitda_margin,
      project.max_ebitda_margin,
      project.min_enterprise_value,
      project.max_enterprise_value,
      project.min_equity_check,
      project.max_equity_check,
      project.ownership_preference,
      project.transaction_type,
    );
    deleteSectors.run(project.id);
    deleteProvinces.run(project.id);
    deleteKeywords.run(project.id);
    project.sectors.forEach((sector, index) =>
      insertSector.run(`${project.id}-sector-${index + 1}`, project.id, sector),
    );
    project.provinces.forEach((province, index) =>
      insertProvince.run(
        `${project.id}-province-${index + 1}`,
        project.id,
        province,
      ),
    );
    project.keywords.forEach((keyword, index) =>
      insertKeyword.run(
        `${project.id}-keyword-${index + 1}`,
        project.id,
        keyword,
      ),
    );
  }
}

export function seed(d: DatabaseSync, directory: string) {
  if (d.prepare("SELECT id FROM users WHERE id='demo-advisor'").get()) {
    syncDemoDocuments(d, directory);
    syncDemoBuyerProjects(d);
    return;
  }
  d.exec("BEGIN IMMEDIATE");
  try {
    const password = hashPassword(randomBytes(32).toString("hex"));
    const people = [
      [
        "demo-advisor",
        "advisor@example.test",
        "Alex Morgan",
        "Northstar Advisory",
        "advisor",
        "advisor",
        "Ontario",
        "Independent M&A advisor focused on Canadian business services and industrial companies.",
      ],
      [
        "demo-owner",
        "owner@example.test",
        "Jamie Chen",
        "Cedar & Co.",
        "owner",
        "business",
        "Ontario",
        "Building the next chapter for a family of Canadian businesses.",
      ],
      [
        "demo-buyer",
        "buyer@example.test",
        "Taylor Reid",
        "Evergreen Capital",
        "buyer",
        "private_equity",
        "Ontario",
        "Patient capital for enduring Canadian businesses. Focused on business services and manufacturing.",
      ],
      [
        "demo-buyer-2",
        "buyer2@example.test",
        "Sam Laurent",
        "Laurent Partners",
        "buyer",
        "search_fund",
        "Québec",
        "An operator-led acquisition group investing across Canada.",
      ],
      [
        "demo-advisor-2",
        "advisor2@example.test",
        "Morgan Ellis",
        "Pacific Partners",
        "advisor",
        "advisor",
        "British Columbia",
        "Advising business owners on succession and strategic acquisitions across Western Canada.",
      ],
    ];
    for (const [
      id,
      email,
      name,
      company,
      role,
      organizationType,
      province,
      bio,
    ] of people) {
      d.prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role,province,bio,sectors,is_demo) VALUES(?,?,?,?,?,?,?,?,?,1)",
      ).run(
        id,
        email,
        password,
        name,
        company,
        role,
        province,
        bio,
        "Business services,Manufacturing",
      );
      d.prepare(
        "INSERT INTO organizations(id,name,slug,organization_type,province) VALUES(?,?,?,?,?)",
      ).run(
        `org-${id}`,
        company,
        `${company
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}-${id}`,
        organizationType,
        province,
      );
      d.prepare(
        "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'owner','active')",
      ).run(`membership-${id}`, `org-${id}`, id);
    }
    const deals = [
      [
        "cedar",
        "Project Cedar",
        "Cedar Industrial Services Ltd.",
        "Business services",
        "Ontario",
        "Hamilton",
        8400000,
        1800000,
        9500000,
        42,
        2004,
        "An established industrial maintenance partner with recurring contracts and a diversified customer base.",
        "Maintenance and inspection services across Southern Ontario. 72% recurring revenue. The founder is seeking a succession partner and is open to a transition period.",
        "Due diligence",
      ],
      [
        "summit",
        "Project Summit",
        "Summit Precision Manufacturing Inc.",
        "Manufacturing",
        "Alberta",
        "Calgary",
        12600000,
        2400000,
        14000000,
        68,
        1998,
        "Precision manufacturing business serving energy, infrastructure, and industrial customers.",
        "A 38,000-square-foot facility with an experienced management team. Customer concentration and equipment schedules are available in the data room.",
        "LOI review",
      ],
      [
        "harbour",
        "Project Harbour",
        "Harbour Health Group Inc.",
        "Healthcare",
        "British Columbia",
        "Victoria",
        4200000,
        820000,
        5100000,
        26,
        2011,
        "A community-focused allied health group with multiple locations and a strong referral network.",
        "Three leased clinic locations and a contracted team. Personal patient information is excluded from this demonstration.",
        "On market",
      ],
      [
        "maple",
        "Project Maple",
        "Maple Cloud Solutions Inc.",
        "Technology",
        "Ontario",
        "Ottawa",
        3100000,
        620000,
        4600000,
        18,
        2015,
        "Managed IT and cloud services provider with long-standing small-business clients.",
        "Subscription-based IT support with a focus on professional services firms. The founder is open to remaining in a commercial role.",
        "On market",
      ],
      [
        "atlas",
        "Project Atlas",
        "Atlas Logistics Inc.",
        "Transportation",
        "Québec",
        "Montréal",
        17800000,
        2100000,
        11800000,
        84,
        2001,
        "Regional logistics operator connecting businesses across Québec and Eastern Ontario.",
        "Privately owned fleet and dispatch operation. Financial and fleet records are available to approved counterparties.",
        "Preparation",
      ],
      [
        "birch",
        "Project Birch",
        "Birch Specialty Foods Ltd.",
        "Food & beverage",
        "Nova Scotia",
        "Halifax",
        5600000,
        940000,
        6300000,
        35,
        2008,
        "Specialty food producer with regional retail distribution and a growing private-label business.",
        "Family-owned production business with an established local management team and a multi-year supply base.",
        "On market",
      ],
    ];
    for (const row of deals)
      d.prepare(
        "INSERT INTO deals(id,title,company_name,sector,province,city,revenue,ebitda,asking_price,employees,founded,description,confidential_summary,stage,owner_id,advisor_id,published,owner_organization_id,advisor_organization_id,created_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'demo-owner','demo-advisor',?,'org-demo-owner','org-demo-advisor','demo-owner')",
      ).run(...row, row[13] === "Preparation" ? 0 : 1);
    for (const [id, deal, buyer, status, nda] of [
      ["access-cedar", "cedar", "demo-buyer", "approved", "verified"],
      ["access-summit", "summit", "demo-buyer", "approved", "verified"],
      ["access-harbour", "harbour", "demo-buyer", "requested", "not_requested"],
      ["access-cedar-2", "cedar", "demo-buyer-2", "nda_pending", "requested"],
    ])
      d.prepare(
        "INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        deal,
        buyer,
        status,
        nda,
        "Fictional demonstration record. No legal agreement was signed.",
      );
    syncDemoDocuments(d, directory);
    d.prepare(
      "UPDATE access SET nda_document_id='doc-cedar-nda' WHERE id='access-cedar'",
    ).run();
    for (const [id, deal, title, days, buyer] of [
      [
        "task-1",
        "cedar",
        "Review the FY2025 financial overview",
        3,
        "demo-buyer",
      ],
      ["task-2", "cedar", "Schedule the management meeting", 5, "demo-buyer"],
      ["task-3", "summit", "Review indicative offer terms", 7, null],
      ["task-4", "harbour", "Review buyer access request", 2, null],
    ] as const) {
      const date = new Date(Date.now() + days * 86400000)
        .toISOString()
        .slice(0, 10);
      d.prepare(
        "INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,'demo-advisor')",
      ).run(id, deal, title, date, buyer);
    }
    d.prepare(
      "INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES('offer-1','summit','demo-buyer',13200000,'Share purchase','Fictional indicative offer, subject to diligence.','doc-summit-loi')",
    ).run();
    d.prepare(
      "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES('message-1','cedar','demo-buyer','demo-advisor','Welcome to the Cedar workspace. The financial overview is ready to review. Please add your questions here so we can keep the process organized.')",
    ).run();
    d.prepare(
      "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES('message-2','cedar','demo-buyer','demo-buyer','Thank you, Alex. We will review the financials ahead of the management meeting.')",
    ).run();
    d.prepare(
      "INSERT INTO activity(id,deal_id,actor_id,action) VALUES('activity-1','cedar','demo-advisor','Opened the demonstration deal room'),('activity-2','summit','demo-buyer','Submitted an indicative LOI'),('activity-3','harbour','demo-buyer','Requested confidential access')",
    ).run();
    syncDemoBuyerProjects(d);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
