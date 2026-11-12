import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { Lawyer } from "@/lib/clientes";
import { appOrigin, digest, RequestError } from "./http";
import { isSessionCookie, rawSessionCookies, selectedSessionCookies, SESSION_COOKIE, SESSION_MAX_AGE, SESSION_PATH } from "../auth-cookies";
import { stageCookie } from "./request-context";

export async function clearSessionCookies() {
  const names = new Set([SESSION_COOKIE, ...rawSessionCookies((await headers()).get('cookie') || '').map(c => c.name)]);
  for (const name of names) for (const path of ['/', SESSION_PATH]) stageCookie({name, value: '', options: {path, maxAge: 0, httpOnly: true, secure: Boolean(process.env.VERCEL) || appOrigin().startsWith('https:'), sameSite: 'lax'}});
}

function settings(key: "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY") {
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env[key];
  if (!url || !apiKey) throw new Error("Supabase indisponível.");
  if (process.env.VERCEL && new URL(url).protocol !== "https:") throw new Error("Supabase exige HTTPS.");
  return { url, apiKey };
}

export function systemClient(timeout?: number) {
  const { url, apiKey } = settings("SUPABASE_SECRET_KEY");
  return createClient(url, apiKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: timeout ? { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(init?.signal ? [init.signal] : [])]) }) } : undefined,
  });
}

export async function sessionClient(freshLogin = false) {
  const { url, apiKey } = settings("SUPABASE_PUBLISHABLE_KEY");
  const header = (await headers()).get('cookie') || '';
  const secure = Boolean(process.env.VERCEL) || appOrigin().startsWith('https:');
  return createServerClient(url, apiKey, {
    cookieOptions: { name: SESSION_COOKIE, httpOnly: true, secure, sameSite: "lax", path: SESSION_PATH, maxAge: SESSION_MAX_AGE },
    cookies: {
      encode: "tokens-only",
      getAll: () => freshLogin ? [] : selectedSessionCookies(header),
      setAll: (values) => {
        const active = new Set(values.filter(v => v.value && v.options.maxAge !== 0).map(v => v.name));
        for (const name of new Set(rawSessionCookies(header).map(c => c.name))) {
          for (const path of ['/', SESSION_PATH]) if (path === '/' || !active.has(name)) stageCookie({name, value: '', options: {path, maxAge: 0, httpOnly: true, secure, sameSite: 'lax'}});
        }
        for (const { name, value, options } of values) if (isSessionCookie(name)) {
          stageCookie({name, value, options: {...options, domain: undefined, path: SESSION_PATH, httpOnly: true, secure, sameSite: 'lax', maxAge: value ? SESSION_MAX_AGE : 0}});
        }
      },
    },
  });
}

type SessionClient = Awaited<ReturnType<typeof sessionClient>>;

export async function lawyerProfile(client: SessionClient, userId: string) {
  const { data, error } = await client.from("adv_advogados")
    .select("id,nome,oab_numero,oab_uf,permissao")
    .eq("auth_user_id", userId).eq("ativo", true).maybeSingle<Lawyer & { id: string }>();
  if (error) throw error;
  if (!data || !['gestao', 'consulta'].includes(data.permissao)) return null;
  const { id, ...lawyer } = data;
  return { lawyer, lawyerId: id };
}

export async function requireLawyer() {
  if (!rawSessionCookies((await headers()).get('cookie') || '').length) {
    throw new RequestError("Entre para acessar a área restrita.", 401, 'AUTH_REQUIRED');
  }
  const client = await sessionClient();
  let result = await client.auth.getUser();
  if (result.error && result.error.status === 401 && result.error.name !== 'AuthSessionMissingError') {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error && (!refreshed.error.status || refreshed.error.status >= 500)) throw refreshed.error;
    if (!refreshed.error) result = await client.auth.getUser();
  }
  if (result.error && (!result.error.status || result.error.status >= 500)) throw result.error;
  if (!result.data.user) {
    await clearSessionCookies();
    throw new RequestError("Sua sessão expirou. Entre novamente para continuar.", 401, 'SESSION_EXPIRED');
  }
  const profile = await lawyerProfile(client, result.data.user.id);
  if (!profile) {
    await clearSessionCookies();
    throw new RequestError("Sua sessão expirou ou seu acesso não está autorizado. Entre novamente.", 401, 'SESSION_NOT_AUTHORIZED');
  }
  return { client, ...profile };
}

export async function allowAttempt(scope: string, source: string, seconds: number, maximum: number) {
  const { data, error } = await systemClient().rpc("adv_limitar_tentativas", {
    p_chave: digest(scope, source), p_janela_segundos: seconds, p_maximo: maximum,
  });
  if (error) throw error;
  return data === true;
}

