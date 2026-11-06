import { Scale } from "lucide-react";
import Link from "next/link";

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className={`brand${dark ? " brand-light" : ""}`} aria-label="Controle Cliente Renata, página inicial">
    <span className="brand-mark"><Scale size={22} aria-hidden="true" /></span>
    <span><strong>Renata</strong><small>CONTROLE DE CLIENTES</small></span>
  </Link>;
}

