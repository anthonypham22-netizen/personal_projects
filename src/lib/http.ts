import { NextResponse } from "next/server";
import { AppError } from "./service";
export function checkOrigin(request: Request) {
  const origin=request.headers.get("origin");
  const configured=process.env.APP_URL || "http://localhost:3000";
  const allowed=new Set([new URL(configured).origin]);
  if(process.env.NODE_ENV!=="production"){allowed.add("http://127.0.0.1:3000");allowed.add("http://localhost:3000");}
  if(!origin||!allowed.has(origin))throw new AppError("Request origin is not allowed.",403);
}
export async function jsonBody(request: Request) {
  if(!request.headers.get("content-type")?.includes("application/json"))throw new AppError("JSON content is required.",415);
  if(Number(request.headers.get("content-length")||0)>64000)throw new AppError("Request is too large.",413);
  const body=await request.text();if(Buffer.byteLength(body)>64000)throw new AppError("Request is too large.",413);
  try{return JSON.parse(body);}catch{throw new AppError("Invalid JSON.");}
}
export function failure(error: unknown) {
  if(error instanceof AppError)return NextResponse.json({error:error.message},{status:error.status});
  console.error("Acquire request failed",error instanceof Error?error.message:"Unknown error");
  return NextResponse.json({error:"Something went wrong. Please try again."},{status:500});
}
