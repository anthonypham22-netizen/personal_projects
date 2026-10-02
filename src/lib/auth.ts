import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "./buyer-identity-verification";
import { sessionUser } from "./service";

export async function currentUser() {
  return sessionUser((await cookies()).get("northlane_session")?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}
