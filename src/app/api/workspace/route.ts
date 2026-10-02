import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { AppError, workspace, mutate } from "@/lib/service";
import { checkOrigin, jsonBody, failure } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    return NextResponse.json(await workspace(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AppError("Please sign in.", 401);
    return NextResponse.json(await mutate(user, await jsonBody(request)));
  } catch (e) {
    return failure(e);
  }
}
