import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "./service";
export async function currentUser() { return sessionUser((await cookies()).get("northlane_session")?.value); }
export async function requireUser() { const user=await currentUser();if(!user)redirect("/login");return user; }
