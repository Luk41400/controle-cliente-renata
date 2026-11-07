import { timingSafeEqual } from "node:crypto";
import { cleanupPhotos } from "@/lib/server/client-lifecycle";
import { failure, json, problem } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return problem("Serviço indisponível.", 503);
  const expected = Buffer.from(`Bearer ${secret}`);
  const value = Buffer.from(received);
  if (value.length !== expected.length || !timingSafeEqual(value, expected)) return problem("Acesso não autorizado.", 401);
  try {
    return json(await cleanupPhotos());
  } catch (error) {
    return failure(error);
  }
}
