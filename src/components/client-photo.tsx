"use client";

import NextImage from "next/image";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

export function ClientPhoto({ id, hasPhoto, revision = "", large = false }: {
  id: string; hasPhoto: boolean; revision?: string; large?: boolean;
}) {
  const [result, setResult] = useState<{ key: string; url?: string; error?: boolean }>();
  const [retry, setRetry] = useState(0);
  const key = `${id}:${revision}:${retry}`;
  useEffect(() => {
    if (!hasPhoto) return;
    const controller = new AbortController();
    let url: string | undefined;
    fetch("/api/admin/foto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ver", id }), cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("photo");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setResult({ key, url });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: true });
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id, hasPhoto, key]);
  const current = result?.key === key ? result : undefined;
  return <div className={`photo-avatar-wrap${large ? " photo-large" : ""}`}>
    <span className="photo-avatar" title={current?.error ? "Fotografia indisponível" : undefined}>
      {hasPhoto && current?.url
        ? <NextImage src={current.url} alt={large ? "Fotografia do cliente" : ""} width={large ? 96 : 38} height={large ? 96 : 38} unoptimized />
        : <UserRound size={large ? 38 : 18} aria-hidden="true" />}
    </span>
    {large && hasPhoto && current?.error && <button type="button" className="text-button" onClick={() => setRetry(retry + 1)}>Recarregar foto</button>}
  </div>;
}
