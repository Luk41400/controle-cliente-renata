"use client";

import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { ufs, type Lawyer } from "@/lib/clientes";
import { Brand } from "./brand";
import { Dashboard } from "./dashboard";

const sessionPath = "/api/admin/sessao";

export function AdminPortal() {
  const [lawyer, setLawyer] = useState<Lawyer | null>();
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const [sessionNotice, setSessionNotice] = useState("");
  const exit = useCallback((expired = true) => { setSessionNotice(expired ? "Sua sessão expirou. Entre novamente para continuar." : ""); setLawyer(null); }, []);
  const signedIn = Boolean(lawyer);

  useEffect(() => {
    const request = new AbortController();
    api<{ lawyer: Lawyer }>(sessionPath, undefined, request.signal).then(({ lawyer }) => {
      if (!request.signal.aborted) setLawyer(lawyer);
    }).catch((error) => {
      if (request.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        if (error.code !== 'AUTH_REQUIRED') setSessionNotice(error.message);
        setLawyer(null);
      }
      else setFailure(errorMessage(error));
    });
    return () => request.abort();
  }, [retry]);

  useEffect(() => {
    if (!signedIn) return;
    let request: AbortController | undefined;
    function recheck() {
      if (document.visibilityState !== "visible" || request) return;
      request = new AbortController();
      const { signal } = request;
      api<{ lawyer: Lawyer }>(sessionPath, undefined, signal).then(({ lawyer }) => {
        if (!signal.aborted) setLawyer(lawyer);
      }).catch((error) => {
        if (!signal.aborted && error instanceof ApiError && error.status === 401) exit();
      }).finally(() => { request = undefined; });
    }
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", recheck);
    return () => {
      request?.abort();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", recheck);
    };
  }, [signedIn, exit]);

  if (lawyer) return <Dashboard key={`${lawyer.oab_uf}:${lawyer.oab_numero}`} lawyer={lawyer} onExit={exit} />;
  if (lawyer === null) return <Login notice={sessionNotice} onLogin={(value) => { setSessionNotice(""); setLawyer(value); }} />;
  return <main className="screen-state">
    <Brand />
    {failure ? <><p className="notice notice-error" role="alert">{failure}</p><button className="button primary" onClick={() => { setFailure(""); setRetry(retry + 1); }}>Tentar novamente</button></>
      : <p className="inline-state" role="status"><LoaderCircle className="spinner" size={20} aria-hidden="true" /> Verificando sessão…</p>}
    <Link className="subtle-link" href="/">Voltar ao cadastro</Link>
  </main>;
}

function Login({ onLogin, notice }: { onLogin: (lawyer: Lawyer) => void; notice: string }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setFailure("");
    try {
      const { lawyer } = await api<{ lawyer: Lawyer }>(sessionPath, data);
      onLogin(lawyer);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-layout">
    <header className="simple-header"><Brand /><Link className="subtle-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Voltar ao cadastro</Link></header>
    <main className="login-main">
      <div className="login-intro"><span className="section-icon"><LockKeyhole size={23} aria-hidden="true" /></span><div className="eyebrow gold">ACESSO RESTRITO</div>
        <h1>Área do advogado</h1><p className="lead">Entre para consultar e gerenciar os atendimentos do escritório.</p></div>
      <form className="login-card" onSubmit={login} method="post" action={sessionPath} aria-busy={busy}>
        <fieldset disabled={busy}>
          <legend>Credenciais profissionais</legend>
          <div className="login-fields">
            <div className="field"><label htmlFor="oab">Número da OAB</label><input id="oab" name="oab" maxLength={20} autoComplete="username" required placeholder="Número de inscrição" /></div>
            <div className="field"><label htmlFor="uf">Estado da OAB (UF)</label><select id="uf" name="uf" defaultValue="" required><option value="" disabled>Selecione</option>{ufs.map((uf) => <option key={uf}>{uf}</option>)}</select></div>
            <div className="field field-wide"><label htmlFor="senha">Senha</label><input id="senha" name="senha" type="password" autoComplete="current-password" maxLength={256} required placeholder="Digite sua senha" /></div>
          </div>
          {notice && !failure && <p className="notice" role="status">{notice}</p>}
          {failure && <p className="notice notice-error" role="alert">{failure}</p>}
          <button className="button primary login-submit">{busy ? "Entrando…" : "Entrar"}{busy ? <LoaderCircle size={18} className="spinner" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
        </fieldset>
      </form>
      <p className="login-footnote"><ShieldCheck size={17} aria-hidden="true" /> Acesso exclusivo a advogados autorizados</p>
    </main>
  </div>;
}

