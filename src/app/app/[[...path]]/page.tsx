import { requireUser } from "@/lib/auth";
import { workspace } from "@/lib/service";
import { Workspace } from "@/components/workspace";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const metadata={title:"Workspace",robots:{index:false,follow:false}};
export default async function AppPage({params}:{params:Promise<{path?:string[]}>}){const user=await requireUser();const {path=[]}=await params;return <Workspace key={path.join("/")} initial={workspace(user)} section={path[0]||"overview"} dealId={path[0]==="deals"?path[1]:undefined}/>;}
