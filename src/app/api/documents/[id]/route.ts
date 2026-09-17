import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";
import { dataDirectory,one } from "@/lib/db";
import { AppError,canReadDocument,getDeal,audit } from "@/lib/service";
import { failure } from "@/lib/http";
import type { Document } from "@/lib/types";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{const user=await currentUser();if(!user)throw new AppError("Please sign in.",401);
    const {id}=await params;const doc=one<Document&{storage_key:string;mime:string}>("SELECT * FROM documents WHERE id=?",id);
    if(!doc||!canReadDocument(user,getDeal(doc.deal_id),doc))throw new AppError("Document not found or access is restricted.",404);
    const file=await readFile(path.join(dataDirectory(),"uploads",path.basename(doc.storage_key)));
    audit(user,doc.deal_id,"Downloaded a document");
    return new Response(new Uint8Array(file),{headers:{"Content-Type":doc.mime,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g,"%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(e){return failure(e);}
}
