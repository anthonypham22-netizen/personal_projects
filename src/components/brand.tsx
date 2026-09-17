import Link from "next/link";
import { cn } from "@/lib/utils";
export function Brand({dark=false,href="/"}:{dark?:boolean;href?:string}){return <Link href={href} className={cn("brand",dark&&"brand-light")} aria-label="Acquire home"><span className="brand-mark" aria-hidden="true">A</span><span>acquire<span className="brand-period">.</span></span></Link>;}
