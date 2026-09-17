import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { all, one, run, db } from "./db";
import { hashPassword, verifyPassword, tokenHash } from "./passwords";
import { PROVINCES, SECTORS, STAGES, type User, type Deal, type Access, type Document, type Message, type Task, type Offer, type Activity, type WorkspaceData } from "./types";

export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const userColumns = "id,email,name,company,role,province,bio,sectors,min_revenue,max_revenue,is_demo";
const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const idSchema = text(1,100);
const amount = z.coerce.number().int().min(0).max(10000000000);
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const result = schema.safeParse(input); if (!result.success) throw new AppError(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")); return result.data; };
export const isManager = (user: User, deal: Deal) => deal.owner_id === user.id || deal.advisor_id === user.id;
export const getDeal = (id: string) => { const deal = one<Deal>("SELECT * FROM deals WHERE id=?", id); if (!deal) throw new AppError("This deal is not available.",404); return deal; };
export const membership = (dealId: string, userId: string) => one<Access>("SELECT * FROM access WHERE deal_id=? AND buyer_id=?",dealId,userId);
export const canAccess = (user: User, deal: Deal) => isManager(user,deal) || membership(deal.id,user.id)?.status === "approved";
export function requireManager(user: User, deal: Deal) { if (!isManager(user,deal)) throw new AppError("Only this deal’s owner or appointed advisor can do that.",403); }
export function requireAccess(user: User, deal: Deal) { if (!canAccess(user,deal)) throw new AppError("Confidential access has not been approved.",403); }
export function canReadDocument(user: User, deal: Deal, doc: Pick<Document,"audience"|"buyer_id"|"category">) {
  if (isManager(user,deal)) return true;
  const member = membership(deal.id,user.id);
  if (!member || ["denied","revoked"].includes(member.status)) return false;
  if (doc.category === "NDA" && doc.audience === "buyer" && doc.buyer_id === user.id) return true;
  return member.status === "approved" && (doc.audience === "approved" || (doc.audience === "buyer" && doc.buyer_id === user.id));
}
export function audit(user: User, dealId: string, action: string) { run("INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",randomUUID(),dealId,user.id,action); }
export function limit(key: string, maximum: number, seconds = 900) {
  const now = Date.now();
  run("DELETE FROM rate_limits WHERE resets_at < ?",now);
  run("INSERT INTO rate_limits(key,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",key,now+seconds*1000);
  if ((one<{attempts:number}>("SELECT attempts FROM rate_limits WHERE key=?",key)?.attempts || 0) > maximum) throw new AppError("Too many attempts. Please try again later.",429);
}
export function sessionUser(token?: string): User | undefined {
  if (!token) return undefined;
  return one<User>(`SELECT ${userColumns.split(",").map(c=>`u.${c}`).join(",")} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND (u.is_demo=0 OR ?=1)`,tokenHash(token),Date.now(),process.env.ALLOW_DEMO === "true" ? 1 : 0);
}
export function createSession(userId: string) {
  run("DELETE FROM sessions WHERE expires_at<?",Date.now());
  const token = randomBytes(32).toString("hex");
  run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",tokenHash(token),userId,Date.now()+7*86400000);
  return token;
}
export function login(input: unknown) {
  const data = parse(z.object({email:z.email().max(254),password:z.string().min(1).max(128)}),input);
  const email = data.email.toLowerCase(); limit(`login:${tokenHash(email)}`,10);
  const user = one<User & {password_hash:string}>("SELECT * FROM users WHERE email=? AND is_demo=0",email);
  if (!user || !verifyPassword(data.password,user.password_hash)) throw new AppError("Email or password is incorrect.",401);
  return createSession(user.id);
}
export function register(input: unknown) {
  if (process.env.ALLOW_REGISTRATION === "false") throw new AppError("Registration is currently closed. Contact your pilot administrator.",403);
  const data = parse(z.object({name:text(2,100),company:text(2,160),email:z.email().max(254),password:z.string().min(12).max(128),role:z.enum(["buyer","owner","advisor"])}),input);
  limit("registration",30,3600);
  const email=data.email.toLowerCase(); if(one("SELECT id FROM users WHERE email=?",email)) throw new AppError("An account with this email already exists. Please sign in.");
  const id=randomUUID(); run("INSERT INTO users(id,email,password_hash,name,company,role) VALUES(?,?,?,?,?,?)",id,email,hashPassword(data.password),data.name,data.company,data.role);
  return createSession(id);
}
export function match(user: User, deal: Deal) {
  const reasons: string[]=[];
  const sectors=user.sectors.split(",").filter(Boolean);
  if (!sectors.length || sectors.includes(deal.sector)) reasons.push("Industry fit");
  if (!user.province || user.province === deal.province) reasons.push("Geography fit");
  if (deal.revenue>=user.min_revenue && deal.revenue<=user.max_revenue) reasons.push("Revenue fit");
  return {match_score:Math.round(reasons.length/3*100),match_reasons:reasons};
}
export function workspace(user: User): WorkspaceData {
  const rawDeals = all<Deal>("SELECT d.* FROM deals d JOIN users owner ON owner.id=d.owner_id WHERE owner.is_demo=? AND (d.owner_id=? OR d.advisor_id=? OR (?='buyer' AND (d.published=1 OR d.id IN (SELECT deal_id FROM access WHERE buyer_id=?)))) ORDER BY d.created_at DESC,d.title",user.is_demo,user.id,user.id,user.role,user.id);
  const deals = rawDeals.map(d=> {
    const managing=isManager(user,d), allowed=canAccess(user,d), member=membership(d.id,user.id);
    return {...d,company_name:allowed?d.company_name:"Confidential company", city:allowed?d.city:"", employees:allowed?d.employees:0,founded:allowed?d.founded:0,confidential_summary:allowed?d.confidential_summary:"",can_manage:managing,has_access:allowed,access_status:member?.status || "none",...match(user,d)};
  });
  const ids = new Set(deals.map(d=>d.id));
  const manages = (id:string)=>rawDeals.some(d=>d.id===id&&isManager(user,d));
  const has = (id:string)=>rawDeals.some(d=>d.id===id&&canAccess(user,d));
  const activeThread = (id:string,buyerId:string)=> manages(id) || (buyerId===user.id && !["denied","revoked"].includes(membership(id,user.id)?.status || "denied"));
  const access = all<Access>("SELECT a.*,u.name,u.company,u.email FROM access a JOIN users u ON u.id=a.buyer_id ORDER BY a.created_at DESC").filter(a=>ids.has(a.deal_id)&&(manages(a.deal_id)||a.buyer_id===user.id));
  const documents = all<Document>("SELECT d.id,d.deal_id,d.name,d.category,d.size,d.version,d.audience,d.buyer_id,d.uploaded_by,d.created_at,u.name uploader_name,p.title deal_title FROM documents d JOIN users u ON u.id=d.uploaded_by JOIN deals p ON p.id=d.deal_id ORDER BY d.created_at DESC").filter(doc=> { const d=rawDeals.find(d=>d.id===doc.deal_id); return d&&canReadDocument(user,d,doc); });
  const messages = all<Message>("SELECT m.*,u.name sender_name,u.role sender_role,d.title deal_title,b.name buyer_name FROM messages m JOIN users u ON u.id=m.sender_id JOIN users b ON b.id=m.buyer_id JOIN deals d ON d.id=m.deal_id ORDER BY m.created_at,m.rowid").filter(m=>ids.has(m.deal_id)&&activeThread(m.deal_id,m.buyer_id));
  const tasks=all<Task>("SELECT t.*,d.title deal_title FROM tasks t JOIN deals d ON d.id=t.deal_id ORDER BY t.due_date").filter(t=>ids.has(t.deal_id)&&(manages(t.deal_id)||(has(t.deal_id)&&t.buyer_id===user.id)));
  const offers=all<Offer>("SELECT o.*,u.company buyer_name FROM offers o JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC").filter(o=>ids.has(o.deal_id)&&(manages(o.deal_id)||(has(o.deal_id)&&o.buyer_id===user.id)));
  const activity=all<Activity>("SELECT a.*,u.name actor_name,d.title deal_title FROM activity a JOIN users u ON u.id=a.actor_id JOIN deals d ON d.id=a.deal_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 200").filter(a=>manages(a.deal_id)||(has(a.deal_id)&&a.actor_id===user.id));
  const advisors=all<WorkspaceData["advisors"][number]>("SELECT id,name,company,province,bio FROM users WHERE role='advisor' AND (is_demo=0 OR ?=1)",user.is_demo && process.env.ALLOW_DEMO === "true"?1:0);
  return {user,deals,access,documents,messages,tasks,offers,activity,advisors,demo:!!user.is_demo};
}

export function mutate(user: User, input: unknown): {id?:string; message:string} {
  const envelope=parse(z.object({action:text(),data:z.record(z.string(),z.unknown()).default({})}),input);
  const {action,data}=envelope;
  limit(`mutation:${user.id}`,180,60);
  if(action==="profile") {
    const p=parse(z.object({name:text(2,100),company:text(2,160),province:z.union([z.enum(PROVINCES),z.literal("")]),bio:text(0,2000),sectors:text(0,500),min_revenue:amount,max_revenue:amount}),data);
    if(p.min_revenue>p.max_revenue) throw new AppError("Minimum revenue must not exceed maximum revenue.");
    if(p.sectors.split(",").filter(Boolean).some(s=>!SECTORS.includes(s))) throw new AppError("Select a supported industry.");
    run("UPDATE users SET name=?,company=?,province=?,bio=?,sectors=?,min_revenue=?,max_revenue=? WHERE id=?",p.name,p.company,p.province,p.bio,p.sectors,p.min_revenue,p.max_revenue,user.id);
    return {message:"Profile saved."};
  }
  if(action==="password") {
    const p=parse(z.object({current:z.string().min(1).max(128),password:z.string().min(12).max(128)}),data);
    if(user.is_demo) throw new AppError("Demo account passwords cannot be changed.");
    const stored=one<{password_hash:string}>("SELECT password_hash FROM users WHERE id=?",user.id)!;
    if(!verifyPassword(p.current,stored.password_hash)) throw new AppError("Current password is incorrect.");
    run("UPDATE users SET password_hash=? WHERE id=?",hashPassword(p.password),user.id);
    run("DELETE FROM sessions WHERE user_id=?",user.id);
    return {message:"Password changed. Please sign in again."};
  }
  if(action==="createDeal") {
    if(user.role==="buyer") throw new AppError("Only owners and advisors can create mandates.",403);
    const p=parse(z.object({title:text(3,120),company_name:text(2,180),sector:z.enum(SECTORS),province:z.enum(PROVINCES),city:text(1,100),revenue:amount,ebitda:amount,asking_price:amount,employees:z.coerce.number().int().min(0).max(100000),founded:z.coerce.number().int().min(1800).max(new Date().getFullYear()),description:text(30,1200),confidential_summary:text(0,5000)}),data);
    const id=randomUUID();
    run("INSERT INTO deals(id,title,company_name,sector,province,city,revenue,ebitda,asking_price,employees,founded,description,confidential_summary,owner_id,advisor_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,p.title,p.company_name,p.sector,p.province,p.city,p.revenue,p.ebitda,p.asking_price,p.employees,p.founded,p.description,p.confidential_summary,user.id,user.role==="advisor"?user.id:null);
    audit(user,id,"Created a private mandate"); return {id,message:"Mandate created privately. Publish its anonymous teaser when ready."};
  }
  const deal=getDeal(parse(idSchema,data.deal_id));
  const dealOwner=one<{is_demo:number}>("SELECT is_demo FROM users WHERE id=?",deal.owner_id);
  if(!dealOwner||!!dealOwner.is_demo!==!!user.is_demo)throw new AppError("This deal is not available.",404);
  if(action==="requestAccess") {
    if(user.role!=="buyer"||!deal.published) throw new AppError("This opportunity is not accepting requests.",403);
    const existing=membership(deal.id,user.id); if(existing) throw new AppError("You already have an access request for this deal.");
    const notes=parse(text(0,2000),data.notes||"");
    run("INSERT INTO access(id,deal_id,buyer_id,notes) VALUES(?,?,?,?)",randomUUID(),deal.id,user.id,notes);
    audit(user,deal.id,"Requested confidential access"); return {message:"Request sent to the deal team."};
  }
  if(action==="updateDeal") {
    requireManager(user,deal);
    const p=parse(z.object({stage:z.enum(STAGES),published:z.boolean()}),data);
    run("UPDATE deals SET stage=?,published=? WHERE id=?",p.stage,p.published?1:0,deal.id); audit(user,deal.id,`Updated stage to ${p.stage}; teaser ${p.published?"published":"private"}`); return {message:"Deal settings saved."};
  }
  if(action==="appointAdvisor") {
    if(deal.owner_id!==user.id) throw new AppError("Only the mandate creator can appoint its advisor.",403);
    const advisorId=parse(idSchema,data.advisor_id);
    const advisor=one<User>(`SELECT ${userColumns} FROM users WHERE id=? AND role='advisor'`,advisorId);
    if(!advisor || (!!advisor.is_demo!==!!user.is_demo)) throw new AppError("Advisor is not available.");
    run("UPDATE deals SET advisor_id=? WHERE id=?",advisor.id,deal.id);audit(user,deal.id,`Appointed ${advisor.company} as advisor`);return {message:"Advisor appointed and granted deal access."};
  }
  if(action==="connectOwner") {
    if(user.role!=="advisor"||deal.owner_id!==user.id||deal.advisor_id!==user.id)throw new AppError("Only the creating advisor can connect an owner to an unassigned mandate.",403);
    const email=parse(z.email(),data.email).toLowerCase();
    if(data.confirm_authority!==true)throw new AppError("Confirm that you are authorized to connect this owner.");
    const owner=one<User>(`SELECT ${userColumns} FROM users WHERE email=? AND role='owner'`,email);
    if(!owner||!!owner.is_demo!==!!user.is_demo)throw new AppError("An eligible owner account was not found. Ask the owner to register first.");
    run("UPDATE deals SET owner_id=? WHERE id=?",owner.id,deal.id);audit(user,deal.id,"Connected the business owner to the mandate");return {message:"Owner connected. They now control the mandate and can change the appointed advisor."};
  }
  if(action==="inviteBuyer") {
    requireManager(user,deal);const email=parse(z.email(),data.email).toLowerCase();
    const buyer=one<User>(`SELECT ${userColumns} FROM users WHERE email=? AND role='buyer'`,email);
    if(!buyer||!!buyer.is_demo!==!!user.is_demo) throw new AppError("No eligible buyer account was found. Ask the buyer to register first.");
    if(membership(deal.id,buyer.id)) throw new AppError("This buyer already has a request or invitation.");
    run("INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,'nda_pending','requested','Invited by the deal team')",randomUUID(),deal.id,buyer.id); audit(user,deal.id,`Invited ${buyer.company}`);return {message:"Buyer invited in-app. Upload their NDA in the data room; email delivery is not configured."};
  }
  if(action==="reviewAccess") {
    requireManager(user,deal); const p=parse(z.object({buyer_id:idSchema,status:z.enum(["nda_pending","approved","denied","revoked"]),nda_document_id:z.string().optional()}),data);
    const member=membership(deal.id,p.buyer_id);if(!member)throw new AppError("Request not found.",404);
    if(p.status==="approved") {
      const doc=one<Document>("SELECT * FROM documents WHERE id=? AND deal_id=? AND category='NDA' AND audience='buyer' AND buyer_id=?",p.nda_document_id||"",deal.id,p.buyer_id);
      if(!doc)throw new AppError("Upload and select this buyer’s executed NDA before approving access.");
      if(data.confirm_reviewed!==true)throw new AppError("Confirm you reviewed the externally executed NDA.");
      run("UPDATE access SET status='approved',nda_status='verified',nda_document_id=? WHERE id=?",doc.id,member.id);
    } else run("UPDATE access SET status=?,nda_status=? WHERE id=?",p.status,p.status==="nda_pending"?"requested":member.nda_status,member.id);
    audit(user,deal.id,`${p.status === "approved"?"Verified external NDA and approved":p.status.replaceAll("_"," ")} access for ${p.buyer_id}`);return {message:"Buyer access updated."};
  }
  if(action==="message") {
    const p=parse(z.object({buyer_id:idSchema,body:text(1,5000)}),data);
    const member=membership(deal.id,p.buyer_id);
    if(!member || ["denied","revoked"].includes(member.status) || (!isManager(user,deal)&&user.id!==p.buyer_id))throw new AppError("You cannot access this conversation.",403);
    run("INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)",randomUUID(),deal.id,p.buyer_id,user.id,p.body);return {message:"Message sent."};
  }
  if(action==="createTask") {
    requireManager(user,deal);const p=parse(z.object({title:text(3,200),due_date:z.iso.date(),buyer_id:z.string().optional()}),data);
    if(p.buyer_id&&membership(deal.id,p.buyer_id)?.status!=="approved")throw new AppError("Select an approved buyer or an internal task.");
    run("INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)",randomUUID(),deal.id,p.title,p.due_date,p.buyer_id||null,user.id);audit(user,deal.id,"Added a diligence task");return {message:"Task added."};
  }
  if(action==="toggleTask") {
    const task=one<Task>("SELECT * FROM tasks WHERE id=? AND deal_id=?",parse(idSchema,data.task_id),deal.id);
    if(!task||(!isManager(user,deal)&&!(canAccess(user,deal)&&task.buyer_id===user.id)))throw new AppError("Task is not available.",403);
    const next=task.status==="done"?"open":"done";run("UPDATE tasks SET status=? WHERE id=?",next,task.id);audit(user,deal.id,`${next==="done"?"Completed":"Reopened"} task: ${task.title}`);return {message:"Task updated."};
  }
  if(action==="submitOffer") {
    requireAccess(user,deal);if(user.role!=="buyer")throw new AppError("Only buyers can submit offers.",403);
    const p=parse(z.object({amount:amount.refine(n=>n>0),structure:z.enum(["Share purchase","Asset purchase","To be negotiated"]),notes:text(0,5000),document_id:idSchema}),data);
    const doc=one<Document>("SELECT * FROM documents WHERE id=? AND deal_id=? AND uploaded_by=? AND category='LOI' AND audience='buyer' AND buyer_id=?",p.document_id,deal.id,user.id,user.id);
    if(!doc)throw new AppError("Upload your LOI document before submitting the offer.");
    run("INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)",randomUUID(),deal.id,user.id,p.amount,p.structure,p.notes,p.document_id);audit(user,deal.id,"Submitted an indicative LOI");return {message:"LOI submitted to the deal team."};
  }
  if(action==="reviewOffer") {
    requireManager(user,deal);const p=parse(z.object({offer_id:idSchema,status:z.enum(["Under review","Shortlisted","Not proceeding"])}),data);
    if(!one("SELECT id FROM offers WHERE id=? AND deal_id=?",p.offer_id,deal.id))throw new AppError("Offer not found.",404);
    run("UPDATE offers SET status=? WHERE id=?",p.status,p.offer_id);audit(user,deal.id,`Marked LOI as ${p.status}`);return {message:"Offer review status saved. This does not execute or accept a legal agreement."};
  }
  throw new AppError("Unknown action.");
}
