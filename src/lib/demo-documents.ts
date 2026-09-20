/** Fictional fixtures only. No financial advice, legal template, or executed agreement. */
import type { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync, lstatSync } from "node:fs";
import path from "node:path";

type Block = { heading: string } | { text: string } | { rows: string[][]; widths: number[] };
type Sample = { id: string; title: string; subtitle: string; filename: string; blocks: Block[] };
const h = (heading: string): Block => ({ heading });
const p = (text: string): Block => ({ text });
const t = (rows: string[][], widths = [230, 92, 92, 92]): Block => ({ rows, widths });

export const demoDocuments: Sample[] = [
  {
    id: "doc-cedar-fin", title: "Financial overview", subtitle: "PROJECT CEDAR | Cedar Industrial Services Ltd. | FY2025", filename: "Cedar - Financial overview FY2025.pdf",
    blocks: [
      p("Illustrative management information for the Acquire walkthrough. All amounts are CAD thousands unless stated otherwise. Years end December 31; figures are invented and unaudited. Adjusted EBITDA is shown separately from reported EBITDA."),
      h("01 / Three-year operating performance"),
      t([["CAD thousands", "FY2023", "FY2024", "FY2025"], ["Revenue", "6,600", "7,500", "8,400"], ["Cost of services", "4,158", "4,575", "5,040"], ["Gross profit", "2,442", "2,925", "3,360"], ["Operating expenses, excluding D&A", "1,342", "1,555", "1,740"], ["Reported EBITDA", "1,100", "1,370", "1,620"], ["Illustrative adjustments", "150", "150", "180"], ["Adjusted EBITDA", "1,250", "1,520", "1,800"], ["Adjusted EBITDA margin", "18.9%", "20.3%", "21.4%"]]),
      p("Revenue grew 12.0% in FY2025. The C$8.4 million revenue and C$1.8 million adjusted EBITDA agree with the Cedar opportunity card. EBITDA is not cash flow, and these adjustments have not been independently verified."),
      h("02 / FY2025 adjusted EBITDA bridge"),
      t([["Bridge component", "CAD '000"], ["Reported EBITDA", "1,620"], ["Owner compensation above assumed replacement cost", "100"], ["Illustrative non-recurring advisory cost", "50"], ["Illustrative relocation cost", "30"], ["Adjusted EBITDA", "1,800"]], [390, 116]),
      p("Buyer diligence should challenge each adjustment, confirm whether costs recur, and assess the replacement management budget. No adjustment is represented as accepted by a lender or buyer."),
      h("03 / Revenue quality and concentration"),
      t([["FY2025 revenue category", "CAD '000", "Share"], ["Recurring maintenance contracts", "6,048", "72%"], ["Project and emergency services", "2,352", "28%"], ["Total revenue", "8,400", "100%"]], [306, 100, 100]),
      p("Customer A represents 14% of revenue; the five largest customers represent 38%. Customers are intentionally anonymized. Review renewal dates, termination rights and margins by contract before drawing a revenue-quality conclusion."),
      h("04 / Working capital and cash considerations"),
      t([["December 31, 2025", "CAD '000"], ["Trade receivables", "1,050"], ["Inventory and operating prepayments", "290"], ["Trade payables and operating accruals", "(500)"], ["Illustrative operating working capital", "840"], ["FY2025 capital expenditure", "210"]], [390, 116]),
      p("Operating working capital excludes cash, debt and income taxes. No normalized working-capital target has been agreed. Capital expenditure is not deducted in the EBITDA table. Request monthly working capital, receivables aging and a maintenance-versus-growth capital expenditure schedule."),
    ],
  },
  {
    id: "doc-cedar-cim", title: "Business overview", subtitle: "PROJECT CEDAR | Confidential information memorandum | Demo edition", filename: "Cedar - Business overview.pdf",
    blocks: [
      p("Cedar Industrial Services Ltd. is a fictional industrial maintenance and inspection company based in Hamilton, Ontario. This memorandum demonstrates the information an approved buyer could receive. It is not an offer to sell a real business."),
      h("01 / At a glance"),
      t([["Attribute", "Illustrative detail"], ["Founded / employees", "2004 / 42 employees"], ["FY2025 revenue / adjusted EBITDA", "C$8.4M / C$1.8M"], ["Revenue from recurring contracts", "72%"], ["Indicative asking price", "C$9.5M; basis to be negotiated"], ["Seller objective", "Succession; transition support available"]], [220, 286]),
      h("02 / What the business does"),
      p("Field teams provide scheduled maintenance, inspections and emergency support to industrial facilities across Southern Ontario. Customer relationships are organized around recurring service schedules, with project work quoted separately. No actual customer identities, locations or contracts are supplied."),
      h("03 / People and operating model"),
      p("The fictional team includes 29 technicians, five field supervisors, four administrative staff, three commercial staff and the founder. A general-management replacement plan has not been finalized. Revenue per employee is C$200,000 using the year-end headcount; it is an illustrative ratio, not a productivity benchmark."),
      h("04 / What a buyer should investigate"),
      t([["Area", "Question for diligence"], ["Customers", "How durable are renewals and termination protections?"], ["Founder dependence", "Which relationships and approvals require the founder?"], ["People", "What certifications, overtime and retention costs matter?"], ["Earnings", "Are the C$180k adjustments supportable and non-recurring?"], ["Capital needs", "What equipment replacement is needed over three years?"], ["Concentration", "What would losing Customer A do to earnings?"]], [145, 361]),
      h("05 / Opportunity hypotheses - not forecasts"),
      p("Potential initiatives include increasing maintenance-contract penetration, improving route density and introducing more structured renewal follow-up. No incremental revenue or synergy has been included in the historical financials. These ideas require validation by the buyer."),
      h("06 / Proposed process"),
      p("The advisor shares an anonymous teaser, reviews buyer fit, records external NDA review, and grants the appropriate document access. Buyers submit questions through their separate deal-room conversation. Indicative proposals should specify price basis, consideration structure, financing conditions and transition expectations."),
      p("The C$9.5M asking price is a seller indication, not an independent valuation. Enterprise value, equity proceeds, debt, cash and working-capital adjustments must be distinguished in any actual negotiation. All records in this document are fictional."),
    ],
  },
  {
    id: "doc-cedar-nda", title: "NDA workflow example", subtitle: "PROJECT CEDAR | External agreement review record | NOT EXECUTED", filename: "Cedar - NDA workflow example NOT EXECUTED.pdf",
    blocks: [
      p("This is a fictional process record, NOT a confidentiality agreement or a legal template. It creates no obligations, contains no signatures and must never be submitted as evidence of an actual executed NDA."),
      h("01 / Fictional parties and intended disclosure"),
      t([["Field", "Demo value"], ["Seller", "Cedar Industrial Services Ltd."], ["Advisor", "Northstar Advisory / Alex Morgan"], ["Buyer", "Evergreen Capital / Taylor Reid"], ["Purpose", "Evaluate an illustrative acquisition opportunity"], ["Requested materials", "Business overview and aggregated financials"], ["Execution status", "NOT EXECUTED - SIMULATED WORKFLOW ONLY"]], [165, 341]),
      h("02 / Review checklist shown to the presenter"),
      p("In a real transaction, the authorized seller-side reviewer would check the correct parties, document version, signer authority and execution evidence before granting any access. The applicable agreement and disclosure scope require professional review. Uploading a file is not itself signing an agreement."),
      h("03 / Example disclosure scope"),
      p("The simulated approved buyer may access Cedar's aggregate financial overview and business overview. Seller strategy notes remain internal. Competing buyers' questions and proposals remain separate. Customer-identifying and employee-level records are not part of this demonstration."),
      h("04 / How to narrate this screen"),
      p("Say: 'This is a demonstration of recording an external NDA review. No agreement has been signed here. The seeded approval is fictional, and document permissions are controlled separately.' Do not describe the sample as verified legal evidence."),
      p("For an actual transaction, obtain an appropriate agreement and execution evidence from the parties' chosen legal and signature processes. This example deliberately omits legal clauses and signature blocks."),
    ],
  },
  {
    id: "doc-summit-fin", title: "Financial overview", subtitle: "PROJECT SUMMIT | Summit Precision Manufacturing Inc. | FY2025", filename: "Summit - Financial overview FY2025.pdf",
    blocks: [
      p("Fictional management information, CAD thousands. Years end December 31. The FY2025 revenue and adjusted EBITDA reconcile to the Summit opportunity card; figures are invented and unaudited."),
      h("01 / Operating performance"),
      t([["CAD thousands", "FY2023", "FY2024", "FY2025"], ["Revenue", "10,400", "11,500", "12,600"], ["Cost of goods sold", "7,176", "7,820", "8,442"], ["Gross profit", "3,224", "3,680", "4,158"], ["Operating expenses, excluding D&A", "1,724", "1,850", "1,998"], ["Reported EBITDA", "1,500", "1,830", "2,160"], ["Illustrative adjustments", "200", "200", "240"], ["Adjusted EBITDA", "1,700", "2,030", "2,400"]]),
      h("02 / FY2025 adjustments and mix"),
      p("The C$240k adjustment comprises C$120k illustrative owner-compensation normalization, C$80k facility reconfiguration and C$40k non-recurring advisory costs. All require diligence. FY2025 adjusted EBITDA margin is 19.0%; gross margin is 33.0%."),
      t([["Customer segment", "CAD '000", "Share"], ["Energy equipment", "5,040", "40%"], ["Infrastructure", "4,410", "35%"], ["Other industrial", "3,150", "25%"], ["Total revenue", "12,600", "100%"]], [306, 100, 100]),
      h("03 / Buyer diligence priorities"),
      p("The example business has 68 employees and a 38,000-square-foot facility. Request equipment condition and ownership records, customer concentration, backlog conversion, maintenance capital expenditure and inventory aging. No assumption is made that backlog will convert to revenue."),
      h("04 / Working capital and capital requirements"),
      t([["December 31, 2025", "CAD '000"], ["Trade receivables", "1,575"], ["Inventory", "1,100"], ["Operating prepayments", "125"], ["Trade payables and operating accruals", "(900)"], ["Illustrative operating working capital", "1,900"], ["FY2025 capital expenditure", "600"]], [390, 116]),
      p("Working capital excludes cash, debt and income taxes. The C$600k capital expenditure assumption includes C$420k maintenance and C$180k expansion investment; neither is deducted in EBITDA. Obtain monthly balances and equipment-level supporting schedules. No working-capital target has been agreed."),
      p("The opportunity shows C$14.0M as the seller's indicative asking price. The separate illustrative LOI totals C$13.2M on a stated enterprise-value basis. Neither is a verified market valuation, and the two figures should not be presented as an accepted transaction."),
    ],
  },
  {
    id: "doc-summit-loi", title: "Indicative offer example", subtitle: "PROJECT SUMMIT | Evergreen Capital | NOT AN EXECUTED LOI", filename: "Summit - Illustrative LOI NOT EXECUTED.pdf",
    blocks: [
      p("This is a fictional term summary for demonstrating offer comparison. It is not a legal template, binding offer, financing commitment or signed letter of intent. No part of this sample creates legal obligations."),
      h("01 / Illustrative proposal"),
      t([["Term", "Demo proposal"], ["Buyer / target", "Evergreen Capital / Summit Precision Manufacturing Inc."], ["Transaction structure", "Share purchase; details to be negotiated"], ["Price basis", "C$13.2M indicative enterprise value"], ["Assumptions", "Cash-free, debt-free; agreed normal working capital"], ["Financing status", "Not committed; subject to buyer financing"], ["Process status", "Submitted for demonstration; NOT ACCEPTED"]], [155, 351]),
      h("02 / Consideration breakdown"),
      t([["Component", "CAD '000", "Share"], ["Cash at closing, before agreed adjustments", "10,560", "80%"], ["Illustrative seller financing", "1,320", "10%"], ["Maximum contingent earnout", "1,320", "10%"], ["Maximum stated consideration", "13,200", "100%"]], [306, 100, 100]),
      p("Cash at closing is not the same as the headline price. The earnout is contingent and may not be paid. Seller financing carries repayment risk. Interest, maturity, security, performance tests and dispute provisions are deliberately not specified in this non-legal example."),
      h("03 / Conditions to be discussed"),
      p("The fictional buyer would need satisfactory financial, commercial, operational and legal diligence; financing arrangements; agreement on transaction documents; and a management-transition plan. No condition is represented as satisfied."),
      h("04 / Illustrative process timetable"),
      t([["Milestone", "Proposed duration"], ["Initial diligence review", "30 days after agreed access"], ["Draft definitive terms", "Following initial diligence"], ["Target closing", "60-90 days; not a commitment"], ["Exclusivity", "Not granted by this example"]], [306, 200]),
      h("05 / Illustrative contingent-consideration outcomes"),
      t([["Assumption", "Total CAD '000"], ["Full earnout and full seller-note repayment", "13,200"], ["Half earnout and full seller-note repayment", "12,540"], ["No earnout and full seller-note repayment", "11,880"]], [390, 116]),
      p("These are undiscounted arithmetic scenarios, not valuations or forecasts. They assume the cash and seller note are paid in full, before transaction adjustments, costs and taxes. Repayment risk and the time value of deferred payments are not quantified."),
      h("06 / Review questions"),
      p("What bridges enterprise value to equity proceeds? How will working capital be measured? What evidence supports the financing plan? Which seller obligations continue after closing? Do the earnout definitions align with who controls the business? Discuss these issues with the relevant professional advisors."),
      p("These durations are scenario assumptions, not promised closing timelines. Changing an offer to 'Shortlisted' in Acquire records workflow progress only; it does not accept or execute an agreement. No signature blocks are provided."),
    ],
  },
  {
    id: "doc-cedar-internal", title: "Seller preparation notes", subtitle: "PROJECT CEDAR | INTERNAL DEMO RECORD | Seller team only", filename: "Cedar - Seller preparation notes INTERNAL.pdf",
    blocks: [
      p("Fictional internal notes for testing seller-team document permissions. Buyers should not be able to download this record, even when they have approved access to other Cedar documents."),
      h("01 / Owner objectives"),
      p("Jamie Chen would like a succession partner who can support the team and maintain customer service. A transition period is possible, but duration and compensation are undecided. The C$9.5M asking price is an initial indication rather than a minimum acceptable outcome."),
      h("02 / Preparation work"),
      t([["Action", "Owner", "Priority"], ["Reconcile adjustments to supporting schedules", "Advisor", "High"], ["Prepare anonymized customer concentration", "Owner", "High"], ["Map founder-dependent responsibilities", "Owner", "High"], ["Review buyer financing approach", "Advisor", "High"], ["Confirm permitted disclosure for each buyer", "Advisor", "High"]], [306, 100, 100]),
      h("03 / Diligence questions to anticipate"),
      p("Buyers may challenge earnings adjustments, request a monthly working-capital analysis and investigate Customer A concentration. Keep factual answers distinct from forecasts. Do not upload actual personal information to the shared demonstration."),
      h("04 / Offer review discipline"),
      p("Compare price basis, cash at closing, contingent consideration, financing conditions and continuing seller obligations. Keep each buyer's proposal private. The advisor should review any owner update before sharing it."),
    ],
  },
];

// Small, dependency-free renderer for these ASCII-only fixtures. Not a general PDF editor.
const escapePdf = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const ascii = (value: string) => value.replace(/[^\x20-\x7e]/g, "-");
const widths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const measure = (value: string, size: number) => [...value].reduce((sum, c) => sum + (widths[c.charCodeAt(0) - 32] || 556), 0) * size / 1000;
function wrap(value: string, width: number, size: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of ascii(value).split(/\s+/)) {
    if (line && measure(`${line} ${word}`, size) > width) { lines.push(line); line = word; }
    else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function renderDemoPdf(sample: Sample): Buffer {
  const pages: string[][] = []; let commands: string[] = []; let y = 0;
  const text = (x: number, yy: number, value: string, size = 10, bold = false, color = "0.14 0.19 0.21") => commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${yy} Tm (${escapePdf(ascii(value))}) Tj ET`);
  const rect = (x: number, yy: number, w: number, height: number, color: string) => commands.push(`${color} rg ${x} ${yy} ${w} ${height} re f`);
  const newPage = () => {
    commands = []; pages.push(commands); y = 666;
    rect(0, 776, 612, 16, "0.06 0.30 0.25");
    text(53, 745, "ACQUIRE", 15, true, "0.06 0.30 0.25");
    text(395, 746, "FICTIONAL DEMONSTRATION", 8, true);
    text(53, 711, sample.title, 26, true);
    text(53, 690, sample.subtitle, 8.1, false, "0.34 0.40 0.42");
    rect(53, 62, 506, 1, "0.78 0.84 0.82");
    text(53, 46, "FICTIONAL ONLY | Not advice, an offer, or an executed agreement.", 8);
    text(512, 46, `Page ${pages.length}`, 8);
  };
  const ensure = (height: number) => { if (y - height < 85) newPage(); };
  newPage();
  for (let index = 0; index < sample.blocks.length; index++) {
    const block = sample.blocks[index];
    if ("heading" in block) {
      const next = sample.blocks[index + 1];
      const upcoming = next && "rows" in next ? next.rows.reduce((sum, row) => sum + Math.max(...row.map((s, i) => wrap(s, next.widths[i] - 20, 9.3).length)) * 13 + 14, 0) : 50;
      ensure(35 + Math.min(upcoming, 310)); y -= 10; text(53, y, block.heading, 12, true, "0.06 0.30 0.25"); y -= 23;
    } else if ("text" in block) {
      const lines = wrap(block.text, 506, 10.2);
      if (lines.length * 14 + 8 < 120) ensure(lines.length * 14 + 8);
      for (const line of lines) { ensure(14); text(53, y, line, 10.2); y -= 14; } y -= 9;
    } else {
      const drawRow = (row: string[], header: boolean) => {
        const cells = row.map((s, i) => wrap(s, block.widths[i] - 20, 9.3));
        const height = Math.max(...cells.map(c => c.length)) * 13 + 12;
        ensure(height);
        rect(53, y - height + 5, 506, height, header ? "0.06 0.30 0.25" : "0.95 0.97 0.96");
        let x = 53;
        cells.forEach((lines, i) => { lines.forEach((line, j) => {
          const numeric = !header && /^\(?[0-9][0-9,.]*%?\)?$/.test(line);
          const left = numeric ? x + block.widths[i] - 10 - measure(line, 9.3) : x + 10;
          text(left, y - (height - lines.length * 13) / 2 - 5 - j * 13, line, 9.3, header, header ? "1 1 1" : "0.14 0.19 0.21");
        }); x += block.widths[i]; });
        y -= height + 2;
      };
      ensure(90); drawRow(block.rows[0], true);
      for (const row of block.rows.slice(1)) {
        const height = Math.max(...row.map((s, i) => wrap(s, block.widths[i] - 20, 9.3).length)) * 13 + 14;
        if (y - height < 85) { newPage(); drawRow(block.rows[0], true); }
        drawRow(row, false);
      }
      y -= 9;
    }
  }
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"];
  const kids: string[] = [];
  for (const page of pages) {
    const pageId = objects.length + 1; const stream = page.join("\n"); kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`;
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

/** Upgrade only untouched, known demo placeholders. Never rewrite user files or real records. */
export function refreshDemoDocuments(db: DatabaseSync, directory: string): number {
  const uploadDir = path.join(directory, "uploads"); mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  if (lstatSync(uploadDir).isSymbolicLink()) throw new Error("Demo uploads directory must not be a symlink.");
  let changed = 0;
  for (const sample of demoDocuments) {
    const row = db.prepare("SELECT d.* FROM documents d JOIN users u ON u.id=d.uploaded_by WHERE d.id=? AND u.is_demo=1").get(sample.id);
    if (!row || row.mime !== "text/plain" || row.storage_key !== sample.id || row.uploaded_by !== (sample.id.includes("loi") ? "demo-buyer" : "demo-advisor")) continue;
    const oldPath = path.join(uploadDir, sample.id);
    if (!existsSync(oldPath) || lstatSync(oldPath).isSymbolicLink()) continue;
    const old = readFileSync(oldPath, "utf8");
    const expected = `ACQUIRE \u2014 FICTIONAL DEMONSTRATION\n${row.name}\n\nThis file contains no real company or transaction information. It is not a legal agreement, financial statement, or executed signature record. Replace it with your own reviewed documents for a private pilot.\n`;
    if (old !== expected || Buffer.byteLength(old) !== row.size) continue;
    const key = `${sample.id}-v2.pdf`; const output = path.join(uploadDir, key); const bytes = renderDemoPdf(sample);
    if (existsSync(output)) {
      if (lstatSync(output).isSymbolicLink() || !readFileSync(output).equals(bytes)) throw new Error(`Refusing to overwrite existing demo asset: ${key}`);
    } else writeFileSync(output, bytes, { mode: 0o600, flag: "wx" });
    db.prepare("UPDATE documents SET name=?,storage_key=?,mime='application/pdf',size=?,version=version+1 WHERE id=? AND storage_key=? AND mime='text/plain'").run(sample.filename, key, bytes.length, sample.id, sample.id);
    changed++;
  }
  return changed;
}
