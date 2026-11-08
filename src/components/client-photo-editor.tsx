"use client";

import NextImage from "next/image";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { MAX_PHOTO_BYTES, PHOTO_SIZE, photoFormat } from "@/lib/photo-rules";
import type { Client } from "@/lib/clientes";
import { ClientPhoto } from "./client-photo";
import { ConfirmationDialog } from "./confirmation-dialog";

export function ClientPhotoEditor({ client, canEdit, disabled, onBusyChange, onSaved, onExit }: {
  client: Client; canEdit: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onSaved: (message: string) => void; onExit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);
  const selection = useRef(0);
  const [source, setSource] = useState<{ image: HTMLImageElement; url: string; key: string }>();
  const [crop, setCrop] = useState({ x: 50, y: 50, zoom: 1 });
  const [processed, setProcessed] = useState<{ blob: Blob; url: string; key: string }>();
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const cropKey = `${source?.key}:${crop.x}:${crop.y}:${crop.zoom}`;

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => () => { selection.current++; }, []);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let url: string | undefined;
    const timer = setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const context = canvas.getContext("2d");
      if (!context) { setProblem("Não foi possível preparar a imagem neste navegador."); return; }
      const width = source.image.naturalWidth;
      const height = source.image.naturalHeight;
      const side = Math.min(width, height) / crop.zoom;
      context.drawImage(source.image, (width - side) * crop.x / 100, (height - side) * crop.y / 100, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      canvas.toBlob((blob) => {
        if (cancelled) return;
        if (!blob || blob.size > 2_000_000) { setProblem("A imagem não pôde ser preparada. Selecione outra fotografia."); return; }
        url = URL.createObjectURL(blob);
        setProcessed({ blob, url, key: cropKey });
      }, "image/webp", .88);
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [source, crop, cropKey]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const attempt = ++selection.current;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProblem("");
    if (!file.size || file.size > MAX_PHOTO_BYTES) { setProblem("Escolha uma imagem de até 5 MB."); return; }
    let format: ReturnType<typeof photoFormat>;
    try {
      format = photoFormat(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    } catch {
      setProblem("Não foi possível ler o arquivo selecionado.");
      return;
    }
    if (attempt !== selection.current) return;
    if (!format) { setProblem("Use uma imagem JPG, JPEG, PNG ou WEBP."); return; }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      if (attempt !== selection.current) { URL.revokeObjectURL(url); return; }
      if (!image.naturalWidth || !image.naturalHeight) { URL.revokeObjectURL(url); setProblem("O arquivo não é uma imagem válida."); return; }
      pending.current = null;
      setSource({ image, url, key: crypto.randomUUID() });
      setCrop({ x: 50, y: 50, zoom: 1 });
      setProcessed(undefined);
    };
    image.onerror = () => { URL.revokeObjectURL(url); if (attempt === selection.current) setProblem("O arquivo não é uma imagem válida."); };
    image.src = url;
  }

  function cancel() {
    if (saving) return;
    selection.current++;
    setSource(undefined);
    setProcessed(undefined);
    setProblem("");
    pending.current = null;
  }

  async function perform(action: "salvar" | "remover" | "limpar") {
    if (disabled || saving) return;
    if (action === "salvar" && (!processed || processed.key !== cropKey)) return;
    setSaving(true);
    onBusyChange(true);
    setProblem("");
    try {
      let image: string | undefined;
      if (action === "salvar") {
        pending.current ??= crypto.randomUUID();
        image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(processed!.blob);
        });
      }
      const result = await api<{ message: string; cleanupPending?: boolean }>("/api/admin/foto", {
        action, id: client.id, version: client.versao, operation: pending.current, image,
      });
      setCleanupPending(Boolean(result.cleanupPending));
      setSource(undefined);
      setProcessed(undefined);
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
          <button className="button secondary" disabled={disabled || saving} type="button" onClick={() => input.current?.click()}><ImagePlus size={16} aria-hidden="true" />{client.foto_path ? "Alterar foto" : "Adicionar foto"}</button>
          {client.foto_path && <button className="button secondary" disabled={disabled || saving} type="button" onClick={() => setRemove(true)}><Trash2 size={15} aria-hidden="true" />Remover foto</button>}
        </div>}
      </div>
    </div>
    {canEdit && <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar foto do cliente" onChange={(event) => void choose(event)} disabled={disabled || saving} />}
    {source && <div className="photo-crop">
      <p>Pré-visualização da fotografia</p>
      {processed?.key === cropKey ? <NextImage src={processed.url} alt="Pré-visualização do recorte" width={192} height={192} unoptimized /> : <p role="status">Preparando imagem…</p>}
      <div className="crop-controls">{([
        ["zoom", "Aproximação", 1, 3, .1], ["x", "Posição horizontal", 0, 100, 1], ["y", "Posição vertical", 0, 100, 1],
      ] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input type="range" min={min} max={max} step={step} value={crop[key]} disabled={disabled || saving} onChange={(event) => { pending.current = null; setCrop({ ...crop, [key]: Number(event.target.value) }); }} /></label>)}</div>
      <div className="inline-actions"><button type="button" className="button secondary" disabled={saving} onClick={cancel}>Cancelar</button>
        <button type="button" className="button primary" disabled={disabled || saving || refreshNeeded || processed?.key !== cropKey} onClick={() => void perform("salvar")}>{saving ? <LoaderCircle size={16} className="spinner" aria-hidden="true" /> : null}Salvar foto</button></div>
    </div>}
    {problem && <p className="notice notice-error" role="alert">{problem}</p>}
    {refreshNeeded && <button type="button" className="button secondary" disabled={disabled || saving} onClick={() => {
      cancel(); setRefreshNeeded(false); onSaved("Detalhes atualizados. Selecione a foto novamente.");
    }}>Atualizar detalhes</button>}
    {cleanupPending && <p className="notice notice-warning">A limpeza do arquivo anterior está em processamento. <button type="button" className="text-button" disabled={disabled || saving} onClick={() => void perform("limpar")}>Verificar limpeza</button></p>}
    {remove && <ConfirmationDialog title="Remover foto do cliente?" message="Esta ação removerá a fotografia cadastrada. Os demais dados do cliente serão preservados."
      confirmLabel="Remover foto" danger busy={saving} onCancel={() => setRemove(false)} onConfirm={() => void perform("remover")} />}
  </section>;
}
