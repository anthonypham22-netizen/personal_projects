import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const canonicalLogo = {
  src: "/succera-logo.png",
  width: 1983,
  height: 793,
} as const;

function SucceraLogoAsset({ sizes }: { sizes: string }) {
  return (
    <Image
      src={canonicalLogo.src}
      alt=""
      aria-hidden="true"
      width={canonicalLogo.width}
      height={canonicalLogo.height}
      sizes={sizes}
    />
  );
}

export function Brand({
  dark = false,
  href = "/",
}: {
  dark?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("brand", dark && "brand-light")}
      aria-label="Succera home"
    >
      <SucceraLogoAsset sizes="(max-width: 480px) 166px, 213px" />
    </Link>
  );
}

export function BrandEmblem() {
  return (
    <span className="brand-emblem" aria-hidden="true">
      <span className="brand-emblem-crop">
        <SucceraLogoAsset sizes="144px" />
      </span>
    </span>
  );
}
