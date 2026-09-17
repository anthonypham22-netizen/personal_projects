import { AuthForm } from "@/components/auth-form";
import type { Role } from "@/lib/types";
export const dynamic="force-dynamic";
export default async function Register({searchParams}:{searchParams:Promise<{role?:string}>}){const {role}=await searchParams;return <AuthForm mode="register" demo={process.env.ALLOW_DEMO==="true"} registration={process.env.ALLOW_REGISTRATION!=="false"} initialRole={["buyer","owner","advisor"].includes(role||"")?role as Role:"buyer"}/>;}
