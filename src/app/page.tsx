import { ArrowUpRight, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { IntakeForm } from "@/components/intake-form";

export default function Home() {
  return <div className="public-layout">
    <aside className="public-sidebar" aria-label="Sobre o portal">
      <Brand dark />
      <div className="sidebar-copy">
        <div className="eyebrow sidebar-eyebrow"><span /> ATENDIMENTO JURÍDICO</div>
        <p className="sidebar-title">O primeiro passo para o seu atendimento.</p>
        <p className="sidebar-description">Compartilhe suas informações e conte ao escritório como podemos ajudar.</p>
      </div>
      <div className="sidebar-art" aria-hidden="true"><div className="art-inner"><Scale size={90} strokeWidth={0.65} /></div></div>
      <div className="sidebar-footer"><ShieldCheck size={19} aria-hidden="true" /><span>Informações tratadas com sigilo</span></div>
    </aside>
    <div className="public-body">
      <header className="public-header"><span className="header-kicker">PORTAL DE ATENDIMENTO</span>
        <Link className="subtle-link" href="/admin"><LockKeyhole size={15} aria-hidden="true" /> Área do advogado <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </header>
      <main className="public-main">
        <div className="eyebrow gold">NOVO ATENDIMENTO</div>
        <h1>Cadastro de Clientes</h1>
        <p className="lead">Preencha as informações abaixo para encaminhar seu cadastro ao escritório.</p>
        <p className="required-legend"><span className="required">*</span> Campos obrigatórios</p>
        <IntakeForm />
      </main>
      <footer className="public-footer"><span>Controle Cliente Renata</span><Link href="/privacidade">Política de Privacidade</Link></footer>
    </div>
  </div>;
}

