import type { FieldErrors } from "./clientes";

export const clientPath = "/api/admin/clientes";
export type ClientActionResult = { message: string; pending?: boolean; operation?: string; id?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly fields: FieldErrors = {}, readonly code?: string, readonly requestId?: string) { super(message); }
}

export async function api<T>(path: string, data?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: data ? "POST" : "GET",
    body: data && JSON.stringify(data),
    headers: data ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new ApiError(result?.message ?? "Não foi possível concluir a solicitação. Tente novamente.", response.status, result?.errors, result?.code, response.headers.get('X-Request-Id') || undefined);
  return result;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Não foi possível conectar ao serviço. Tente novamente.";
}

