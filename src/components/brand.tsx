import { Scale } from "lucide-react";
import Link from "next/link";

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className={`brand${dark ? " brand-light" : ""}`} aria-label="Advocacia Rodrigues e Alves, página inicial">
    <span className="brand-mark"><Scale size={22} aria-hidden="true" /></span>
    <span><strong>Advocacia<br />Rodrigues e Alves</strong></span>
  </Link>;
}

