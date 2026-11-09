"use client";

import NextImage from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_PHOTO_BYTES, photoFormat } from "@/lib/photo-rules";
import { cropGeometry, cropPhoto, initialCrop } from "@/lib/photo-crop";

export function usePhotoDraft(onChange?: () => void) {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [source, setSource] = useState<{ image: HTMLImageElement; url: string; key: string }>();
  const [crop, setCrop] = useState(initialCrop);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => () => { selection.current++; }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const attempt = ++selection.current;
    setProblem("");
    setLoading(false);
    if (!file.size || file.size > MAX_PHOTO_BYTES) { setProblem("Escolha uma imagem de até 5 MB."); return; }
    setLoading(true);
    let url: string | undefined;
    try {
      if (!photoFormat(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) throw new Error("Use uma imagem JPG, JPEG, PNG ou WEBP.");
      if (attempt !== selection.current) return;
      url = URL.createObjectURL(file);
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (attempt !== selection.current) { URL.revokeObjectURL(url); return; }
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("O arquivo não é uma imagem válida.");
      onChange?.();
      setSource({ image, url, key: crypto.randomUUID() });
      setCrop(initialCrop);
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      if (attempt === selection.current) setProblem(error instanceof DOMException ? "O arquivo não é uma imagem válida." : error instanceof Error ? error.message : "Não foi possível ler a fotografia.");
    } finally {
      if (attempt === selection.current) setLoading(false);
    }
  }

  function reset() {
    selection.current++;
    setSource(undefined); setCrop(initialCrop); setProblem(""); setLoading(false); onChange?.();
  }

  return { input, source, crop, problem, loading, choose, reset,
    prepare: () => source ? cropPhoto(source.image, crop) : Promise.resolve(undefined),
    adjust: (key: keyof typeof crop, value: number) => { setCrop((current) => ({ ...current, [key]: value })); onChange?.(); },
  };
}

export function PhotoDraft({ draft, disabled = false }: { draft: ReturnType<typeof usePhotoDraft>; disabled?: boolean }) {
  const { source, crop, input: inputRef, choose, adjust, loading, problem } = draft;
  const width = source?.image.naturalWidth ?? 1;
  const height = source?.image.naturalHeight ?? 1;
  const min = Math.min(width, height);
  const { x, y } = cropGeometry(width, height, crop);
  return <>
    <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar foto do cliente" onChange={(event) => void choose(event)} disabled={disabled} />
    {loading && <p role="status">Carregando fotografia…</p>}
    {source && <div className="photo-crop">
      <p>Pré-visualização da fotografia</p>
      <div className="photo-viewport"><NextImage key={source.key} src={source.url} alt="Pré-visualização do recorte" width={width} height={height} unoptimized draggable={false}
        style={{ width: `${width / min * 100}%`, height: `${height / min * 100}%`, transform: `translate(${-x / width * crop.zoom * 100}%, ${-y / height * crop.zoom * 100}%) scale(${crop.zoom})` }} /></div>
      <div className="crop-controls">{([
        ["zoom", "Aproximação", 1, 3, .1], ["x", "Posição horizontal", 0, 100, 1], ["y", "Posição vertical", 0, 100, 1],
      ] as const).map(([key, label, minValue, max, step]) => <label key={key}>{label}<input type="range" min={minValue} max={max} step={step} value={crop[key]} disabled={disabled} onChange={(event) => adjust(key, Number(event.target.value))} /></label>)}</div>
    </div>}
    {problem && <p className="notice notice-error" role="alert">{problem}</p>}
  </>;
}
