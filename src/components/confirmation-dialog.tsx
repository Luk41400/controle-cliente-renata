"use client";

import { useEffect, useRef } from "react";

export function ConfirmationDialog({ title, message, confirmLabel, danger = false, busy, onCancel, onConfirm }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={ref} className="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-message"
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="confirmation-title">{title}</h2>
    <p id="confirmation-message">{message}</p>
    <div className="inline-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button type="button" className={`button ${danger ? "danger" : "primary"}`} disabled={busy} onClick={onConfirm}>{busy ? "Processando…" : confirmLabel}</button></div>
  </dialog>;
}
