import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ dark = false, href = "/" }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn("brand", dark && "brand-light")} aria-label="Succera home">
      <Image
        src="/succera-logo.png"
        alt=""
        aria-hidden="true"
        width={1983}
        height={793}
        sizes="(max-width: 480px) 166px, 213px"
      />
    </Link>
  );
}
