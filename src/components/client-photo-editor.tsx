"use client";

import { BriefcaseBusiness, ImagePlus, LoaderCircle, Scale, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { photoBase64 } from "@/lib/photo-crop";
import { PhotoDraft, usePhotoDraft } from "./photo-draft";
import { caseLabel } from "@/lib/clientes";
import type { Client } from "@/lib/clientes";
import { ClientPhoto } from "./client-photo";
import { ConfirmationDialog } from "./confirmation-dialog";

export function ClientPhotoEditor({ client, canEdit, disabled, onBusyChange, onSaved, onExit }: {
  client: Client; canEdit: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onSaved: (message: string) => void; onExit: () => void;
}) {
  const pending = useRef<string | null>(null);
  const draft = usePhotoDraft(() => { pending.current = null; });
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);

  function cancel() { if (!saving) { draft.reset(); setProblem(""); } }

  async function perform(action: "salvar" | "remover" | "limpar") {
    if (disabled || saving) return;
    if (action === "salvar" && (!draft.source || draft.loading)) return;
    setSaving(true);
    onBusyChange(true);
    setProblem("");
    try {
      let image: string | undefined;
      if (action === "salvar") {
        pending.current ??= crypto.randomUUID();
        const blob = await draft.prepare();
        if (!blob) return;
        image = await photoBase64(blob);
      }
      const result = await api<{ message: string; cleanupPending?: boolean }>("/api/admin/foto", {
        action, id: client.id, version: client.versao, operation: pending.current, image,
      });
      setCleanupPending(Boolean(result.cleanupPending));
      draft.reset();
      pending.current = null;
      setRemove(false);
      onSaved(result.message);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExit();
      else {
        if (error instanceof ApiError && error.status === 409) { pending.current = null; setRefreshNeeded(true); }
        setProblem(errorMessage(error));
      }
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  return <section className="client-photo-section" aria-labelledby="photo-title">
    <div className="photo-heading"><ClientPhoto id={client.id} hasPhoto={Boolean(client.foto_path)} revision={client.foto_path ?? ""} large />
      <div><h3 id="photo-title">Foto do cliente</h3>
        {canEdit && <div className="inline-actions">
          <button className="button secondary" disabled={disabled || saving} type="button" onClick={() => draft.input.current?.click()}><ImagePlus size={16} aria-hidden="true" />{client.foto_path ? "Alterar foto" : "Adicionar foto"}</button>
          {client.foto_path && <button className="button secondary" disabled={disabled || saving} type="button" onClick={() => setRemove(true)}><Trash2 size={15} aria-hidden="true" />Remover foto</button>}
        </div>}
      </div>
      <span className="case-type-badge" aria-label="Classificação do caso">{client.tipo_caso === "judicial" ? <Scale size={16} aria-hidden="true" /> : <BriefcaseBusiness size={16} aria-hidden="true" />}{client.tipo_caso ? caseLabel[client.tipo_caso] : "Tipo não informado"}</span>
    </div>
    {canEdit && <PhotoDraft draft={draft} disabled={disabled || saving} />}
    {draft.source && <div className="inline-actions"><button type="button" className="button secondary" disabled={saving} onClick={cancel}>Cancelar</button>
      <button type="button" className="button primary" disabled={disabled || saving || refreshNeeded || draft.loading} onClick={() => void perform("salvar")}>{saving ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : null}Salvar foto</button></div>}
    {problem && <p className="notice notice-error" role="alert">{problem}</p>}
    {refreshNeeded && <button type="button" className="button secondary" disabled={disabled || saving} onClick={() => {
      cancel(); setRefreshNeeded(false); onSaved("Detalhes atualizados. Selecione a foto novamente.");
    }}>Atualizar detalhes</button>}
    {cleanupPending && <p className="notice notice-warning">A limpeza do arquivo anterior está em processamento. <button type="button" className="text-button" disabled={disabled || saving} onClick={() => void perform("limpar")}>Verificar limpeza</button></p>}
    {remove && <ConfirmationDialog title="Remover foto do cliente?" message="Esta ação removerá a fotografia cadastrada. Os demais dados do cliente serão preservados."
      confirmLabel="Remover foto" danger busy={saving} onCancel={() => setRemove(false)} onConfirm={() => void perform("remover")} />}
  </section>;
}
