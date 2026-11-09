import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function PrivacyPage() {
  return <>
    <header className="simple-header"><Brand /><Link className="subtle-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Voltar ao cadastro</Link></header>
    <main className="privacy-page">
      <div className="eyebrow gold"><ShieldCheck size={16} aria-hidden="true" /> PROTEÇÃO DE DADOS</div>
      <h1>Política de Privacidade</h1>
      <p className="notice notice-warning">Minuta sujeita à revisão e à aprovação do escritório antes do atendimento a clientes reais.</p>
      <h2>Finalidade do cadastro</h2>
      <p>O escritório utiliza os dados para identificar a pessoa que solicita atendimento, compreender o contexto do pedido e avaliar as providências relacionadas ao atendimento jurídico.</p>
      <h2>Informações tratadas</h2>
      <p>O formulário solicita nome completo, nome social quando aplicável, endereço, filiação, nacionalidade, cidade de nascimento, tipo e relato do caso jurídico. RG, CPF, fotografia e andamento do caso são opcionais e podem ser acrescentados ou atualizados pelo escritório. A fotografia permanece privada e só é enviada ao finalizar o cadastro. Os textos podem conter informações confidenciais ou dados pessoais sensíveis. Inclua apenas o que for necessário para o atendimento.</p>
      <h2>Acesso e segurança</h2>
      <p>O acesso aos registros do portal é restrito aos perfis autorizados pelo escritório. O portal utiliza serviços de hospedagem e banco de dados para receber, guardar e disponibilizar as informações com controle de acesso. O escritório deve confirmar os operadores, os locais de processamento e as condições de eventuais compartilhamentos antes da publicação desta política.</p>
      <h2>Retenção e direitos</h2>
      <p>Os prazos de retenção dependem da finalidade do atendimento e das obrigações legais e profissionais aplicáveis. A pessoa titular pode solicitar confirmação do tratamento, acesso, correção e as demais providências previstas na legislação, conforme o caso.</p>
      <h2>Identificação e contato do escritório</h2>
      <p>A identificação do controlador, o canal para solicitações e as bases legais aplicáveis serão preenchidos pelo escritório na revisão desta minuta.</p>
    </main>
  </>;
}

