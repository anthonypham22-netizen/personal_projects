import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { login,register,createSession,AppError,limit } from "@/lib/service";
import { db,run } from "@/lib/db";
import { tokenHash } from "@/lib/passwords";
import { checkOrigin,jsonBody,failure } from "@/lib/http";
export const runtime="nodejs";
export async function POST(request: Request) {
  try{
    checkOrigin(request);const body=await jsonBody(request);let token:string;
    if(body.action==="logout"){
      const existing=(await cookies()).get("northlane_session")?.value;
      if(existing)run("DELETE FROM sessions WHERE token_hash=?",tokenHash(existing));
      const response=NextResponse.json({ok:true});response.cookies.delete("northlane_session");return response;
    }
    if(body.action==="demo"){
      if(process.env.ALLOW_DEMO!=="true")throw new AppError("Demonstration accounts are disabled.",403);
      if(!["buyer","owner","advisor"].includes(body.role))throw new AppError("Invalid role.");
      db();limit("demo-login",100,60);token=createSession(`demo-${body.role}`);
    }else if(body.action==="register")token=register(body);
    else if(body.action==="login")token=login(body);
    else throw new AppError("Unknown action.");
    const response=NextResponse.json({ok:true});response.cookies.set("northlane_session",token,{httpOnly:true,secure:process.env.COOKIE_SECURE==="true"||new URL(process.env.APP_URL||"http://localhost:3000").protocol==="https:",sameSite:"lax",path:"/",maxAge:7*86400});return response;
  }catch(error){return failure(error);}
}
