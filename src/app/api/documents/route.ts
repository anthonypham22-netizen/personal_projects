import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir,writeFile,unlink } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { dataDirectory,one,run } from "@/lib/db";
import { AppError,getDeal,isManager,canAccess,membership,audit,limit } from "@/lib/service";
import { checkOrigin,failure } from "@/lib/http";
export const runtime="nodejs";
export async function POST(request: Request){
  let storedPath:string|undefined;
  try{
    checkOrigin(request);const user=await currentUser();if(!user)throw new AppError("Please sign in.",401);
    if(user.is_demo || process.env.ALLOW_UPLOADS === "false") throw new AppError("Uploads are disabled in this demonstration. Use the supplied fictional sample documents; do not enter confidential information.",403);
    limit(`upload:${user.id}`,20,60);
    const length=Number(request.headers.get("content-length"));if(!length||length>11*1024*1024)throw new AppError("Upload requires a content length and must be under 10 MB.",413);
    const form=await request.formData();const file=form.get("file");
    if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw new AppError("Select a non-empty file up to 10 MB.");
    const deal=getDeal(String(form.get("deal_id")||""));const managing=isManager(user,deal);
    const category=String(form.get("category")||"Other");if(!["Financials","Company overview","NDA","LOI","Legal","Other"].includes(category))throw new AppError("Invalid document category.");
    const member=membership(deal.id,user.id);
    if(!managing&&!canAccess(user,deal)&&!(category==="NDA"&&member?.status==="nda_pending"))throw new AppError("Document access has not been approved.",403);
    const ext=path.extname(file.name).toLowerCase();const mime:Record<string,string>={".pdf":"application/pdf",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".csv":"text/csv",".txt":"text/plain"};
    if(!mime[ext])throw new AppError("Supported files: PDF, DOCX, XLSX, CSV, TXT.");
    const buffer=Buffer.from(await file.arrayBuffer());
    if(ext===".pdf"&&buffer.subarray(0,5).toString()!=="%PDF-")throw new AppError("The file is not a valid PDF.");
    if([".docx",".xlsx"].includes(ext)&&buffer.subarray(0,2).toString()!=="PK")throw new AppError("The file is not a valid Office document.");
    const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,"_").slice(0,180);
    let audience=managing?String(form.get("audience")||"team"):"buyer";
    let buyerId=managing?String(form.get("buyer_id")||""):user.id;
    if(!["team","approved","buyer"].includes(audience))throw new AppError("Invalid visibility.");
    if(category==="NDA"||category==="LOI"){audience="buyer";if(!buyerId)throw new AppError("Choose the buyer for this agreement.");}
    if(audience==="buyer"&&!membership(deal.id,buyerId))throw new AppError("Choose an invited buyer for this document.");
    if(audience!=="buyer")buyerId="";
    const version=(one<{version:number}>("SELECT MAX(version) version FROM documents WHERE deal_id=? AND name=? AND audience=? AND COALESCE(buyer_id,'')=?",deal.id,name,audience,buyerId)?.version||0)+1;
    const id=randomUUID(),key=randomUUID();const directory=path.join(dataDirectory(),"uploads");await mkdir(directory,{recursive:true,mode:0o700});storedPath=path.join(directory,key);await writeFile(storedPath,buffer,{mode:0o600,flag:"wx"});
    run("INSERT INTO documents(id,deal_id,name,storage_key,mime,category,size,version,audience,buyer_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",id,deal.id,name,key,mime[ext],category,file.size,version,audience,buyerId||null,user.id);
    storedPath=undefined;audit(user,deal.id,`Uploaded ${category.toLowerCase()} document`);return NextResponse.json({id,message:"Document uploaded. Agreement uploads require separate review; they are not automatically signed."});
  }catch(e){if(storedPath)await unlink(storedPath).catch(()=>{});return failure(e);}
}
