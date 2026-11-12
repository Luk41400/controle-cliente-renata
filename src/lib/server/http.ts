import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { originFailure, originPolicy } from "../origin-policy";
import { diagnostic, requestContext } from "./request-context";

export function appOrigin() {
  return originPolicy().primary;
}

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function problem(message: string, status: number, code?: string) {
  if (!code && status === 403) { code = 'ACCESS_DENIED'; diagnostic(code, status); }
  return json({ message, ...(code ? { code } : {}) }, status);
}

export class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'REQUEST_REJECTED') { super(message); }
}

export function validateOrigin(request: Request) {
  const reason = originFailure(request, originPolicy());
  if (reason) {
    diagnostic('ORIGIN_' + reason.toUpperCase(), 403);
    throw new RequestError('Origem da solicitação inválida. Abra o endereço oficial do sistema e tente novamente.', 403, 'ORIGIN_REJECTED');
  }
}

export function route(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => requestContext(request, async () => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) validateOrigin(request);
      return await handler(request);
    } catch (error) { return failure(error); }
  });
}

export async function body(request: Request, limit = 100_000): Promise<Record<string, unknown>> {
  validateOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new RequestError("Formato de solicitação inválido.", 415);
  }
  if (Number(request.headers.get("content-length")) > limit) throw new RequestError("Solicitação muito longa.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Solicitação inválida.", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let raw = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new RequestError("Solicitação muito longa.", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    const data: unknown = JSON.parse(raw + decoder.decode());
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
  } finally {
    reader.releaseLock();
  }
  throw new RequestError("Solicitação inválida.", 400);
}

export function failure(error: unknown) {
  if (error instanceof RequestError) {
    if (error.code !== 'ORIGIN_REJECTED') diagnostic(error.code, error.status);
    return problem(error.message, error.status, error.code);
  }
  diagnostic('SERVICE_UNAVAILABLE', 503);
  return problem("O serviço está indisponível no momento. Tente novamente em instantes.", 503, 'SERVICE_UNAVAILABLE');
}

export function digest(scope: string, value: string) {
  const key = process.env.APP_HASH_SECRET;
  if (!key || key.length < 32) throw new Error("APP_HASH_SECRET indisponível.");
  return createHmac("sha256", key).update(scope).update("\0").update(value).digest("hex");
}

export function sourceIp(request: Request) {
  if (!process.env.VERCEL) return "local";
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) throw new Error("IP de origem indisponível.");
  return ip;
}

