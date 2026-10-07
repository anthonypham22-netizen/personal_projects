import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isPlatformAdmin } from "./buyer-identity-verification";
import { AppError, sessionUser } from "./service";

export async function currentUser() {
  return sessionUser((await cookies()).get("northlane_session")?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) notFound();
  return user;
}

export async function requirePlatformAdminApi() {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in.", 401);
  if (!isPlatformAdmin(user))
    throw new AppError("Platform administrator access required.", 403);
  return user;
}
