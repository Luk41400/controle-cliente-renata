"use client";

import { Archive, ArchiveRestore, CircleCheck, Clock3, FileText, LoaderCircle, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, clientPath, errorMessage, type ClientActionResult } from "@/lib/api";
import { brDateTime, caseLabel, fields, isStatus, maskCpf, statusLabel, statusOptions, validateClient, type Client, type ClientInput, type ClientRow, type Field, type FieldErrors, type History, type Note, type Status } from "@/lib/clientes";
import { ClientFields } from "./client-fields";
import { StatusBadge } from "./status-badge";
import { ClientPhotoEditor } from "./client-photo-editor";
import { ConfirmationDialog } from "./confirmation-dialog";

type Timeline<T> = { items: T[]; more: boolean; page: number };
type Details = { client: Client; notes: Timeline<Note>; history: Timeline<History>; canDelete: boolean };

function editableValues(client: Client): ClientInput {
  return Object.fromEntries(fields.map(({ key }) => [key, key === "cpf" ? maskCpf(client.cpf ?? "") : client[key] ?? ""])) as ClientInput;
}

export function ClientDrawer({ row, canEdit, onClose, onChange, onExit, onCompleted }: {
  row: ClientRow; canEdit: boolean; onClose: () => void; onChange: () => void; onExit: () => void;
  onCompleted: (result: ClientActionResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const noteAttempt = useRef<{ text: string; id: string } | null>(null);
  const [detail, setDetail] = useState<Details>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<ClientInput>();
  const [editingFields, setEditingFields] = useState<Field[]>(fields.map(({ key }) => key));
  const [editLocation, setEditLocation] = useState<"personal" | "type" | "progress">("personal");
  const [confirmation, setConfirmation] = useState<"arquivar" | "restaurar" | "excluir">();
  const deletionAttempt = useRef<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [newStatus, setNewStatus] = useState<Status>(row.status);
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const request = new AbortController();
    api<Details>(clientPath, { action: "detalhes", id: row.id }, request.signal).then((data) => {
      if (request.signal.aborted) return;
      setDetail({ client: data.client, notes: { ...data.notes, page: 0 }, history: { ...data.history, page: 0 }, canDelete: data.canDelete });
      setNewStatus(data.client.status);
      setLoading(false);
    }).catch((error) => {
      if (request.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onExit();
      else setProblem(errorMessage(error));
      setLoading(false);
    });
    return () => request.abort();
  }, [row.id, revision, onExit]);

  function refresh() {
    setLoading(true);
    setProblem("");
    setConflict(false);
    setRevision((value) => value + 1);
  }

  function close() {
    if (busy) return;
    if ((editing || note.trim()) && !window.confirm("Descartar as alterações ainda não salvas?")) return;
    onClose();
  }

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) { onExit(); return; }
    if (error instanceof ApiError && error.status === 409) setConflict(true);
    if (error instanceof ApiError) setErrors(error.fields);
    setProblem(errorMessage(error));
  }

  async function save(payload: object) {
    if (busy || loading) return;
    setBusy(true);
    setProblem("");
    setSuccess("");
    try {
      const { message } = await api<{ message: string }>(clientPath, { ...payload, id: row.id });
      setSuccess(message);
      if ("action" in payload && payload.action === "anotar") { setNote(""); noteAttempt.current = null; }
      setEditing(undefined);
      refresh();
      onChange();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function loadMore(kind: "observacoes" | "historico") {
    if (!detail || busy || loading) return;
    const key = kind === "observacoes" ? "notes" : "history";
    const page = detail[key].page + 1;
    setBusy(true);
    setProblem("");
    try {
      const request = { action: kind, id: row.id, page };
      if (key === "notes") {
        const data = await api<Timeline<Note>>(clientPath, request);
        setDetail({ ...detail, notes: { items: [...detail.notes.items, ...data.items], more: data.more, page } });
      } else {
        const data = await api<Timeline<History>>(clientPath, request);
        setDetail({ ...detail, history: { items: [...detail.history.items, ...data.items], more: data.more, page } });
      }
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  const client = detail?.client;
  function beginEdit(names: Field[], location: "personal" | "type" | "progress" = "personal") {
    if (!client || busy || loading) return;
    setErrors({});
    setEditing(editableValues(client));
    setEditingFields(names);
    setEditLocation(location);
    requestAnimationFrame(() => document.getElementById(`editar-${names[0]}`)?.focus());
  }

  async function completeAction() {
    if (!client || !confirmation || busy || loading) return;
    setBusy(true);
    setProblem("");
    try {
      if (confirmation === "excluir") deletionAttempt.current ??= crypto.randomUUID();
      const result = await api<ClientActionResult>(clientPath, {
        action: confirmation, id: client.id, version: client.versao, operation: deletionAttempt.current,
      });
      onCompleted(result);
    } catch (error) {
      setConfirmation(undefined);
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!client || !editing) return;
    const original = editableValues(client);
    const changed = fields.filter(({ key }) => editingFields.includes(key) && (editing[key] !== original[key] || (editLocation === "type" && !editing.tipo_caso)));
    if (!changed.length) { setEditing(undefined); return; }
    const changes = Object.fromEntries(changed.map(({ key }) => [key, editing[key]]));
    const result = validateClient(changes, true);
    setErrors(result.errors);
    if (!result.valid) {
      const first = fields.find(({ key }) => result.errors[key]);
      if (first) requestAnimationFrame(() => document.getElementById(`editar-${first.key}`)?.focus());
      return;
    }
    const validated = Object.fromEntries(changed.map(({ key }) => [key, result.data[key]]));
    if (editLocation === "progress" || window.confirm("Salvar as alterações neste cadastro?")) void save({ action: "editar", version: client.versao, ...validated });
  }

  const editForm = editing && <form onSubmit={saveEdit} method="post" action={clientPath} noValidate>
    <fieldset disabled={busy || loading || conflict}>
      <div className="field-grid"><ClientFields prefix="editar" names={editingFields} values={editing} errors={errors} onChange={(key, value) => {
        setEditing({ ...editing, [key]: value });
        setErrors({ ...errors, [key]: undefined });
      }} /></div>
      <div className="inline-actions"><button className="button primary">{busy ? "Salvando…" : editLocation === "progress" ? "Salvar" : "Salvar informações"}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(undefined)}>Cancelar</button></div>
    </fieldset>
  </form>;

  const confirmCopy = {
    arquivar: { title: "Arquivar cliente?", message: "Este cliente será movido para a área de clientes arquivados e deixará de aparecer na lista principal. Suas informações serão preservadas e poderão ser restauradas posteriormente.", label: "Confirmar arquivamento" },
    restaurar: { title: "Restaurar cliente?", message: "Este cliente voltará para a lista principal de clientes ativos.", label: "Restaurar" },
    excluir: { title: "Tem certeza de que deseja excluir este cliente?", message: "Esta ação excluirá permanentemente o cadastro do cliente e os dados associados previstos para exclusão. Essa operação não poderá ser desfeita.", label: "Sim, excluir cliente" },
  };

  return <dialog className="drawer" ref={dialog} aria-labelledby="drawer-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="drawer-header"><div><div className="eyebrow gold">DETALHES DO ATENDIMENTO</div><h2 id="drawer-title">{client?.nome ?? row.nome}</h2></div>
      <button type="button" className="button secondary icon-button" aria-label="Fechar detalhes" disabled={busy} onClick={close}><X size={20} aria-hidden="true" /></button></header>
    <div className="drawer-body" aria-busy={loading || busy}>
      {problem && <p role="alert" className="notice notice-error">{problem}</p>}
      {success && <p role="status" className="notice notice-success"><CircleCheck size={18} aria-hidden="true" />{success}</p>}
      {loading && <p className="inline-state" role="status"><LoaderCircle className="spinner" size={18} aria-hidden="true" /> Carregando detalhes…</p>}
      {!loading && ((!client && problem) || conflict) && <button className="button secondary" onClick={() => { setEditing(undefined); refresh(); }}>Atualizar detalhes</button>}
      {detail && client && <>
        <ClientPhotoEditor client={client} canEdit={canEdit} disabled={busy || loading || Boolean(editing)} onBusyChange={setBusy} onExit={onExit}
          onSaved={(message) => { setSuccess(message); refresh(); onChange(); }} />
        <div className="client-summary"><StatusBadge status={client.status} />{client.arquivado_em && <span className="archive-badge">Cliente arquivado</span>}<span><Clock3 size={15} aria-hidden="true" /> Cadastrado em {brDateTime.format(new Date(client.criado_em))}</span></div>
        {client.arquivado_em && <p className="muted">Arquivado em {brDateTime.format(new Date(client.arquivado_em))}</p>}
        {canEdit && !editing && <form className="status-form" method="post" action={clientPath} onSubmit={(event) => {
          event.preventDefault();
          if (newStatus !== client.status && window.confirm(`Alterar o status para “${statusLabel[newStatus]}”?`)) void save({ action: "status", status: newStatus, version: client.versao });
        }}>
          <div className="field"><label htmlFor="detail-status">Status do caso</label><select id="detail-status" value={newStatus} disabled={busy || loading || conflict} onChange={(event) => setNewStatus(event.target.value as Status)}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></div>
          <button className="button primary" disabled={busy || loading || conflict || newStatus === client.status}>Salvar status</button>
        </form>}
        <section className="drawer-section" aria-labelledby="details-personal">
          <div className="drawer-section-title"><h3 id="details-personal"><UserRound size={18} aria-hidden="true" /> Informações pessoais</h3>
            {canEdit && !editing && <button className="button secondary" disabled={busy || loading || conflict} onClick={() => beginEdit(fields.filter(({ key }) => key !== "andamento_caso").map(({ key }) => key))}><Pencil size={15} aria-hidden="true" /> Editar</button>}</div>
          {editing && editLocation === "personal" ? editForm : <dl className="detail-grid">{fields.filter(({ key }) => key !== "caso_juridico" && key !== "tipo_caso" && key !== "andamento_caso").map(({ key, label }) =>
            <div className={key === "endereco" ? "field-wide" : ""} key={key}><dt>{label}</dt><dd>
              <span>{(key === "cpf" && /^\d{11}$/.test(client.cpf ?? "") ? maskCpf(client.cpf ?? "") : client[key]) || "Não informado"}</span>
              {canEdit && !editing && (key === "rg" || key === "cpf") && <button type="button" className="text-button document-action" disabled={busy || loading || conflict}
                aria-label={`${client[key] ? "Editar" : "Adicionar"} ${label}`} onClick={() => beginEdit([key])}>{client[key] ? "Editar" : "Adicionar"}</button>}
            </dd></div>)}</dl>}
        </section>
        <section className="drawer-section">
          <div className="drawer-section-title"><h3>Tipo de caso jurídico</h3>{canEdit && !editing && <button type="button" className="button secondary" disabled={busy || loading || conflict} onClick={() => beginEdit(["tipo_caso"], "type")}>{client.tipo_caso ? "Alterar tipo" : "Adicionar classificação"}</button>}</div>
          {editing && editLocation === "type" ? editForm : <p>{client.tipo_caso ? caseLabel[client.tipo_caso] : "Não informado"}</p>}
        </section>
        {!editing && <section className="drawer-section"><h3><FileText size={18} aria-hidden="true" /> Caso Jurídico</h3><p className="case-text">{client.caso_juridico}</p></section>}
        <section className="drawer-section" aria-labelledby="details-progress">
          <div className="drawer-section-title"><h3 id="details-progress">Andamento do caso</h3>{canEdit && !editing && <button type="button" className="button secondary" disabled={busy || loading || conflict} onClick={() => beginEdit(["andamento_caso"], "progress")}><Pencil size={15} aria-hidden="true" />Editar andamento</button>}</div>
          {editing && editLocation === "progress" ? editForm : <p className={client.andamento_caso ? "case-text" : "muted"}>{client.andamento_caso || "Nenhum andamento registrado"}</p>}
        </section>
        <section className="drawer-section"><h3>Observações internas</h3>
          {canEdit && <form className="note-form" method="post" action={clientPath} onSubmit={(event) => {
            event.preventDefault();
            const text = note.trim();
            if (!text) return;
            if (noteAttempt.current?.text !== text) noteAttempt.current = { text, id: crypto.randomUUID() };
            void save({ action: "anotar", text, noteId: noteAttempt.current.id });
          }}>
            <div className="field"><label htmlFor="note">Nova observação</label><textarea id="note" rows={3} maxLength={10000} placeholder="Registre uma informação do atendimento…" value={note} onChange={(event) => setNote(event.target.value)} disabled={busy || loading || Boolean(editing)} required /></div>
            <button className="button primary" disabled={busy || loading || Boolean(editing) || !note.trim()}><Plus size={16} aria-hidden="true" /> Adicionar observação</button>
          </form>}
          {detail.notes.items.length ? <ol className="timeline">{detail.notes.items.map((item) => <li key={item.id}>
            <div><strong>{item.advogado_nome || "Advogado"}</strong><time dateTime={item.criado_em}>{brDateTime.format(new Date(item.criado_em))}</time></div><p>{item.texto}</p>
          </li>)}</ol> : <p className="muted">Nenhuma observação registrada.</p>}
          {detail.notes.more && <button className="button secondary" disabled={busy || loading} onClick={() => void loadMore("observacoes")}>Mais observações</button>}
        </section>
        <section className="drawer-section"><h3>Histórico de atividades</h3>
          {detail.history.items.length ? <ol className="timeline">{detail.history.items.map((item) => <li key={item.id}>
            <div><strong>{describe(item)}</strong><time dateTime={item.criado_em}>{brDateTime.format(new Date(item.criado_em))}</time></div>
            <p>{item.advogado_nome || "Portal de atendimento"}</p>
          </li>)}</ol> : <p className="muted">Nenhuma atividade registrada.</p>}
          {detail.history.more && <button className="button secondary" disabled={busy || loading} onClick={() => void loadMore("historico")}>Mais atividades</button>}
        </section>
        {canEdit && <div className="client-final-actions">
          <button type="button" className="button secondary" disabled={busy || loading || Boolean(editing) || Boolean(note.trim()) || conflict} onClick={() => setConfirmation(client.arquivado_em ? "restaurar" : "arquivar")}>
            {client.arquivado_em ? <ArchiveRestore size={17} aria-hidden="true" /> : <Archive size={17} aria-hidden="true" />}{client.arquivado_em ? "Restaurar cliente" : "Arquivar cliente"}
          </button>
          <button type="button" className="button danger-outline" disabled={busy || loading || Boolean(editing) || Boolean(note.trim()) || conflict || !detail.canDelete}
            aria-describedby={!detail.canDelete ? "retention-message" : undefined} onClick={() => setConfirmation("excluir")}><Trash2 size={17} aria-hidden="true" />Excluir cliente</button>
          {!detail.canDelete && <p id="retention-message" className="muted">Exclusão bloqueada por retenção. O cadastro pode ser arquivado. A liberação individual deve ser registrada no Supabase após a revisão do escritório.</p>}
          {note.trim() && <p className="muted">Salve ou limpe a observação pendente antes de arquivar, restaurar ou excluir o cadastro.</p>}
        </div>}
      </>}
    </div>
    {confirmation && <ConfirmationDialog title={confirmCopy[confirmation].title} message={confirmCopy[confirmation].message} confirmLabel={confirmCopy[confirmation].label}
      danger={confirmation === "excluir"} busy={busy} onCancel={() => setConfirmation(undefined)} onConfirm={() => void completeAction()} />}
  </dialog>;
}

function describe(item: History) {
  if (item.acao === "cadastro") return "Cadastro recebido";
  if (item.acao === "observacao") return "Observação adicionada";
  const actions: Record<string, string> = { arquivamento: "Cliente arquivado", restauracao: "Cliente restaurado",
    foto_adicionada: "Foto do cliente adicionada", foto_atualizada: "Foto do cliente atualizada", foto_removida: "Foto do cliente removida" };
  if (actions[item.acao]) return actions[item.acao];
  if (item.acao !== "atualizacao") return "Atividade registrada";
  const { status_anterior: before, status_novo: after, campos } = item.detalhes ?? {};
  if (isStatus(before) && isStatus(after)) return `Status alterado de ${statusLabel[before]} para ${statusLabel[after]}`;
  const labels = Array.isArray(campos) ? campos.map((key) => fields.find((field) => field.key === key)?.label).filter(Boolean) : [];
  return labels?.length ? `Cadastro editado · ${labels.join(", ")}` : "Cadastro atualizado";
}

