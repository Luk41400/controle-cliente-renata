import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function appOrigin() {
  const url = new URL(process.env.APP_ORIGIN || (process.env.VERCEL ? "" : "http://localhost:3000"));
  if (process.env.VERCEL && url.protocol !== "https:") throw new Error("APP_ORIGIN exige HTTPS.");
  return url.origin;
}

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function problem(message: string, status: number) {
  return json({ message }, status);
}

export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function body(request: Request, limit = 100_000): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== appOrigin() || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new RequestError("Origem da solicitação inválida.", 403);
  }
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
  if (error instanceof RequestError) return problem(error.message, error.status);
  return problem("O serviço está indisponível no momento. Tente novamente em instantes.", 503);
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

