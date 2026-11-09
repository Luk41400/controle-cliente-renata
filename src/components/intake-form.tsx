"use client";

import { ArrowRight, CircleCheck, FileText, ImagePlus, LoaderCircle, ShieldCheck, Trash2, UserRound, MapPin } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { emptyClient, fields, validateClient, type Field, type FieldErrors } from "@/lib/clientes";
import { ClientFields } from "./client-fields";
import { PhotoDraft, usePhotoDraft } from "./photo-draft";
import { photoBase64 } from "@/lib/photo-crop";

const sections = [
  { id: "01", title: "Identificação", icon: UserRound, names: ["tipo_caso", "nome", "nome_social", "rg", "cpf"] },
  { id: "02", title: "Endereço e origem", icon: MapPin, names: ["endereco", "filiacao", "nacionalidade", "cidade_nascimento"] },
  { id: "03", title: "Sobre o seu caso", icon: FileText, names: ["caso_juridico", "andamento_caso"] },
] satisfies { id: string; title: string; icon: typeof UserRound; names: Field[] }[];

export function IntakeForm() {
  const [values, setValues] = useState(emptyClient);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ success: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ snapshot: string; id: string } | null>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const draft = usePhotoDraft(() => { attempt.current = null; });

  function showErrors(next: FieldErrors) {
    setErrors(next);
    const first = fields.find(({ key }) => next[key]);
    if (first) requestAnimationFrame(() => document.getElementById(`cadastro-${first.key}`)?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || draft.loading) return;
    setFeedback(undefined);
    const result = validateClient(values);
    if (!result.valid) { showErrors(result.errors); return; }
    setErrors({});
    submitting.current = true;
    setBusy(true);
    try {
      const blob = await draft.prepare();
      const image = blob ? await photoBase64(blob) : undefined;
      const snapshot = JSON.stringify({ ...result.data, image });
      if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, id: crypto.randomUUID() };
      const { message } = await api<{ message: string }>("/api/cadastro", { ...result.data, envio: attempt.current.id, image });
      setValues(emptyClient());
      draft.reset();
      attempt.current = null;
      setFeedback({ success: true, text: message });
      requestAnimationFrame(() => notice.current?.focus());
    } catch (error) {
      if (error instanceof ApiError) {
        showErrors(error.fields);
        if (error.status === 409) attempt.current = null;
      }
      setFeedback({ success: false, text: errorMessage(error) });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <form noValidate onSubmit={submit} method="post" action="/api/cadastro" className="intake-form" aria-busy={busy}>
    <fieldset disabled={busy} className="form-content">
      <legend className="sr-only">Dados do cadastro</legend>
      {sections.map(({ id, title, icon: Icon, names }) => <section className="form-section" key={id} aria-labelledby={`section-${id}`}>
        <div className="section-heading"><span className="section-icon"><Icon size={19} aria-hidden="true" /></span>
          <h2 id={`section-${id}`}>{title}</h2><span className="section-number">{id}</span>
        </div>
        <div className="field-grid"><ClientFields names={names} values={values} errors={errors} prefix="cadastro" onChange={(key, value) => {
          setValues((current) => ({ ...current, [key]: value }));
          setErrors((current) => ({ ...current, [key]: undefined }));
          if (feedback?.success) setFeedback(undefined);
        }} /></div>
        {id === "01" && <div className="intake-photo" aria-labelledby="intake-photo-title">
          <h3 id="intake-photo-title">Foto do cliente <span className="optional">Opcional</span></h3>
          <p className="field-help">Escolha uma imagem JPG, PNG ou WEBP de até 5 MB. Ajuste o enquadramento antes de enviar o cadastro.</p>
          <div className="inline-actions"><button type="button" className="button secondary" disabled={busy || draft.loading} onClick={() => draft.input.current?.click()}><ImagePlus size={16} aria-hidden="true" />{draft.source ? "Substituir fotografia" : "Adicionar foto"}</button>
            {draft.source && <button type="button" className="button secondary" onClick={draft.reset} disabled={busy}><Trash2 size={16} aria-hidden="true" />Remover seleção</button>}</div>
          <PhotoDraft draft={draft} disabled={busy} />
        </div>}
      </section>)}
      <div className="form-privacy"><ShieldCheck size={22} aria-hidden="true" /><p>O escritório utiliza estas informações para avaliar seu pedido de atendimento. Saiba como os dados são tratados na <Link href="/privacidade">Política de Privacidade</Link>.</p></div>
      {feedback && <p ref={notice} tabIndex={-1} role={feedback.success ? "status" : "alert"} className={`notice ${feedback.success ? "notice-success" : "notice-error"}`}>
        {feedback.success && <CircleCheck size={20} aria-hidden="true" />}{feedback.text}
      </p>}
      <button className="button primary intake-submit" disabled={busy || draft.loading}>
        {busy ? "Enviando cadastro…" : "Enviar cadastro"}
        {busy ? <LoaderCircle className="spinner" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
      </button>
    </fieldset>
  </form>;
}

