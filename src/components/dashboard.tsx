"use client";

import { Archive, ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CircleCheck, ClipboardList, Inbox, LoaderCircle, LogOut, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, clientPath, errorMessage, type ClientActionResult } from "@/lib/api";
import { brDate, caseLabel, statusLabel, statusOptions, type ClientRow, type Lawyer } from "@/lib/clientes";
import { Brand } from "./brand";
import { ClientDrawer } from "./client-drawer";
import { StatusBadge } from "./status-badge";
import { ClientPhoto } from "./client-photo";

const initialFilters = { search: "", status: "", start: "", end: "", order: "recente", page: 0, archived: false };
type Totals = { total: number; novos: number; andamento: number; concluidos: number; ativos: number; arquivados: number };
type List = { stats: Totals; rows: ClientRow[]; total: number; pageSize: number };
const cards = [
  { key: "total", label: "Total de clientes", icon: UsersRound },
  { key: "novos", label: "Novos cadastros", icon: Inbox },
  { key: "andamento", label: "Casos em andamento", icon: BriefcaseBusiness },
  { key: "concluidos", label: "Casos concluídos", icon: CircleCheck },
] as const;

export function Dashboard({ lawyer, onExit }: { lawyer: Lawyer; onExit: () => void }) {
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: List; error?: string }>();
  const [selected, setSelected] = useState<ClientRow>();
  const [signingOut, setSigningOut] = useState(false);
  const [exitError, setExitError] = useState("");
  const [notice, setNotice] = useState<ClientActionResult>();
  const [checkingDeletion, setCheckingDeletion] = useState(false);
  const key = JSON.stringify({ filters, revision });
  const current = result?.key === key ? result : undefined;
  const pageCount = current?.data ? Math.max(1, Math.ceil(current.data.total / current.data.pageSize)) : 1;

  useEffect(() => {
    const request = new AbortController();
    api<List>(clientPath, { action: "listar", ...filters }, request.signal).then((data) => {
      if (request.signal.aborted) return;
      const last = Math.max(0, Math.ceil(data.total / data.pageSize) - 1);
      if (filters.page > last) setFilters((value) => ({ ...value, page: last }));
      else setResult({ key, data });
    }).catch((error) => {
      if (request.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onExit();
      else setResult({ key, error: errorMessage(error) });
    });
    return () => request.abort();
  }, [filters, key, onExit]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draft, page: 0 });
  }

  function selectArchive(archived: boolean) {
    const next = { ...initialFilters, archived };
    setDraft(next);
    setFilters(next);
  }

  function closeDrawer() {
    setSelected(undefined);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.getElementById("clients-title")?.focus();
    });
  }

  async function checkDeletion() {
    if (!notice?.id || !notice.operation || checkingDeletion) return;
    setCheckingDeletion(true);
    try {
      const result = await api<ClientActionResult>(clientPath, { action: "exclusao_estado", id: notice.id, operation: notice.operation });
      setNotice(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExit();
      else setExitError(errorMessage(error));
    } finally {
      setCheckingDeletion(false);
    }
  }

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setExitError("");
    try {
      await api("/api/admin/sessao", { action: "sair" });
      onExit();
    } catch (error) {
      setExitError(errorMessage(error));
      setSigningOut(false);
    }
  }

  return <div className="dashboard-layout">
    <aside className="admin-sidebar"><Brand dark />
      <nav className="admin-nav" aria-label="Atendimentos do escritório"><p>ESCRITÓRIO</p>
        <button type="button" aria-current={!filters.archived ? "page" : undefined} onClick={() => selectArchive(false)}><ClipboardList size={19} aria-hidden="true" /> Clientes ativos</button>
        <button type="button" aria-current={filters.archived ? "page" : undefined} onClick={() => selectArchive(true)}><Archive size={19} aria-hidden="true" /> Clientes Arquivados</button>
      </nav>
      <div className="admin-side-foot"><span className="sidebar-footer"><ShieldCheck size={17} aria-hidden="true" /> Área restrita</span></div>
    </aside>
    <div className="dashboard-body">
      <header className="dashboard-header"><span className="header-kicker">ADVOCACIA RODRIGUES E ALVES</span>
        <div className="account"><span className="account-name"><strong>{lawyer.nome}</strong><small>OAB {lawyer.oab_uf} {lawyer.oab_numero}</small></span>
          <button className="button secondary sign-out" disabled={signingOut} onClick={logout}><LogOut size={16} aria-hidden="true" /> {signingOut ? "Saindo…" : "Sair"}</button></div>
      </header>
      <main className="dashboard-main">
        <div className="eyebrow gold">ÁREA DO ESCRITÓRIO</div><h1>{filters.archived ? "Clientes Arquivados" : "Atendimentos"}</h1>
        <p className="lead">Consulte os cadastros e acompanhe o andamento dos casos.</p>
        {exitError && <p className="notice notice-error" role="alert">{exitError}</p>}
        {notice && <div className={`notice ${notice.pending ? "notice-warning" : "notice-success"}`} role="status"><p>{notice.message}</p>
          {notice.pending && <button type="button" className="button secondary" disabled={checkingDeletion} onClick={() => void checkDeletion()}>{checkingDeletion ? "Verificando…" : "Verificar exclusão"}</button>}
        </div>}
        <nav className="client-tabs" aria-label="Listas de clientes">
          <button type="button" aria-pressed={!filters.archived} onClick={() => selectArchive(false)}>Clientes ativos <span>{current?.data?.stats.ativos ?? "—"}</span></button>
          <button type="button" aria-pressed={filters.archived} onClick={() => selectArchive(true)}>Clientes Arquivados <span>{current?.data?.stats.arquivados ?? "—"}</span></button>
        </nav>
        <section className="stats" aria-label="Indicadores de atendimentos">
          {cards.map(({ key, label, icon: Icon }) => <div className="stat-card" key={key}>
            <span className="section-icon"><Icon size={19} aria-hidden="true" /></span><div><p>{key === "total" ? (filters.archived ? "Clientes arquivados" : "Clientes ativos") : label}</p>
              <strong>{current?.data?.stats?.[key]?.toLocaleString("pt-BR") ?? "—"}</strong></div>
          </div>)}
        </section>
        <section className="table-card" aria-labelledby="clients-title" aria-busy={!current}>
          <div className="table-intro"><div><h2 id="clients-title" tabIndex={-1}>{filters.archived ? "Cadastros arquivados" : "Clientes cadastrados"}</h2><p>Pesquise por nome ou combine os filtros.</p></div></div>
          <form className="filters" onSubmit={apply} method="post" action={clientPath}>
            <div className="field"><label htmlFor="search">Nome do cliente</label><div className="search-control"><Search size={16} aria-hidden="true" /><input id="search" placeholder="Nome completo ou parcial" value={draft.search} maxLength={200} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></div></div>
            <div className="field"><label htmlFor="filter-status">Status</label><select id="filter-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">Todos</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></div>
            <div className="field"><label htmlFor="filter-start">A partir de</label><input type="date" id="filter-start" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></div>
            <div className="field"><label htmlFor="filter-end">Até</label><input type="date" id="filter-end" value={draft.end} min={draft.start || undefined} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></div>
            <div className="field"><label htmlFor="filter-order">Ordenação</label><select id="filter-order" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })}><option value="recente">Mais recentes</option><option value="nome">Nome (A–Z)</option></select></div>
            <div className="filter-actions"><button className="button primary"><Search size={16} aria-hidden="true" /> Buscar</button><button className="button secondary" type="button" onClick={() => selectArchive(filters.archived)}>Limpar</button></div>
          </form>
          {!current && <p role="status" className="table-state"><LoaderCircle className="spinner" size={21} aria-hidden="true" /> Carregando cadastros…</p>}
          {current?.error && <div className="table-state"><p role="alert">{current.error}</p><button className="button secondary" onClick={() => setRevision(revision + 1)}>Tentar novamente</button></div>}
          {current?.data && (current.data.rows.length ? <>
            <table><thead><tr><th scope="col">Nome do cliente</th><th scope="col">Data do cadastro</th><th scope="col">Tipo de caso</th><th scope="col">Status</th>{filters.archived && <th scope="col">Arquivado em</th>}<th scope="col">Ações</th></tr></thead>
              <tbody>{current.data.rows.map((row) => <tr key={row.id}>
                <td className="client-identity"><div className="client-cell"><ClientPhoto id={row.id} hasPhoto={row.tem_foto} revision={String(revision)} /><button className="text-button client-name" onClick={() => setSelected(row)}>{row.nome}</button></div></td>
                <td className="client-date">{brDate.format(new Date(row.criado_em))}</td>
                <td className="client-type">{row.tipo_caso ? caseLabel[row.tipo_caso] : "Não informado"}</td>
                <td className="client-status"><StatusBadge status={row.status} /></td>
                {filters.archived && <td className="client-archived">{row.arquivado_em ? brDate.format(new Date(row.arquivado_em)) : "—"}</td>}
                <td className="client-action"><button className="text-button row-action" onClick={() => setSelected(row)} aria-label={`Visualizar ${row.nome}`}>Visualizar <ArrowUpRight size={15} aria-hidden="true" /></button></td>
              </tr>)}</tbody>
            </table>
            <nav className="pagination" aria-label="Paginação de clientes">
              <p>{current.data.total.toLocaleString("pt-BR")} {current.data.total === 1 ? "cadastro" : "cadastros"}</p>
              <div><button className="button secondary icon-button" aria-label="Página anterior" disabled={filters.page === 0} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ArrowLeft size={17} aria-hidden="true" /></button>
                <span>Página {filters.page + 1} de {pageCount}</span>
                <button className="button secondary icon-button" aria-label="Próxima página" disabled={filters.page + 1 >= pageCount} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}><ArrowRight size={17} aria-hidden="true" /></button></div>
            </nav>
          </> : <div className="table-state empty-state"><ArrowDownWideNarrow size={23} aria-hidden="true" /><strong>Nenhum cliente encontrado</strong><p>Os cadastros que correspondem aos filtros aparecem aqui.</p></div>)}
        </section>
      </main>
    </div>
    {selected && <ClientDrawer key={selected.id} row={selected} canEdit={lawyer.permissao === "gestao"} onExit={onExit}
      onClose={closeDrawer} onChange={() => setRevision((value) => value + 1)}
      onCompleted={(result) => { closeDrawer(); setNotice(result); setRevision((value) => value + 1); }} />}
  </div>;
}

