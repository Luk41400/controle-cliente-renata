import "server-only";
import { RequestError } from "./http";
import { systemClient } from "./supabase";
import { PHOTO_BUCKET, photoPath } from "../photo-rules";

export function checkDatabase(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "40001") throw new RequestError("O cadastro foi alterado ou o envio expirou. Atualize os detalhes antes de salvar.", 409);
  if (error.code === "42501") throw new RequestError("Operação não autorizada. Confira as permissões e a liberação de retenção.", 403);
  if (error.code === "P0002") throw new RequestError("Cadastro ou operação indisponível.", 404);
  if (error.code === "22023" || error.code === "23514") throw new RequestError("Confira as informações e tente novamente.", 422);
  throw error;
}

// A tarefa é registrada antes de cada upload. Falhas são recuperadas pelo cron,
// e a remoção do cadastro aguarda a confirmação da API de Storage.
export async function cleanupPhotos(clientId: string | null = null) {
  const system = systemClient(5_000);
  const claimed = await system.rpc("adv_storage_recolher", { p_cliente: clientId });
  if (claimed.error) throw claimed.error;
  const tasks = (claimed.data ?? []) as { id: string; foto_path: string; token: string }[];
  if (tasks.some((task) => !photoPath(task.foto_path))) throw new Error("Tarefa de Storage inválida.");
  if (tasks.length) {
    const removed = await system.storage.from(PHOTO_BUCKET).remove(tasks.map((task) => task.foto_path));
    if (removed.error) throw removed.error;
    const confirmed = await system.rpc("adv_storage_concluir", {
      p_ids: tasks.map((task) => task.id), p_tokens: tasks.map((task) => task.token),
    });
    if (confirmed.error) throw confirmed.error;
  }
  const finalized = await system.rpc("adv_storage_finalizar_exclusoes", { p_cliente: clientId });
  if (finalized.error) throw finalized.error;
  const pending = await system.rpc("adv_storage_pendentes", { p_cliente: clientId });
  if (pending.error) throw pending.error;
  const reservations = await system.rpc("adv_cadastro_fotos_limpar");
  if (reservations.error) throw reservations.error;
  return { files: tasks.length, deletions: finalized.data as number, pending: Number(pending.data) };
}

export async function tryCleanupPhotos(clientId: string) {
  try {
    const result = await cleanupPhotos(clientId);
    return result.pending === 0;
  } catch {
    return false;
  }
}
