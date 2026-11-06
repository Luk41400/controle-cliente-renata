import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Lawyer } from "@/lib/clientes";
import { appOrigin, digest, RequestError } from "./http";

const sessionCookie = "renata-sessao";

function settings(key: "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY") {
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env[key];
  if (!url || !apiKey) throw new Error("Supabase indisponível.");
  if (process.env.VERCEL && new URL(url).protocol !== "https:") throw new Error("Supabase exige HTTPS.");
  return { url, apiKey };
}

export function systemClient() {
  const { url, apiKey } = settings("SUPABASE_SECRET_KEY");
  return createClient(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export async function sessionClient() {
  const { url, apiKey } = settings("SUPABASE_PUBLISHABLE_KEY");
  const jar = await cookies();
  return createServerClient(url, apiKey, {
    cookieOptions: { name: sessionCookie, httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax", path: "/api/admin" },
    cookies: {
      encode: "tokens-only",
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) jar.set(name, value, options);
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
  if (!data) return null;
  const { id, ...lawyer } = data;
  return { lawyer, lawyerId: id };
}

export async function requireLawyer() {
  const jar = await cookies();
  if (!jar.getAll().some(({ name }) => name === sessionCookie || name.startsWith(`${sessionCookie}.`))) {
    throw new RequestError("Entre para acessar a área restrita.", 401);
  }
  const client = await sessionClient();
  const { data, error } = await client.auth.getUser();
  if (error && error.status && error.status >= 500) throw error;
  if (!data.user) throw new RequestError("Entre para acessar a área restrita.", 401);
  const profile = await lawyerProfile(client, data.user.id);
  if (!profile) {
    await client.auth.signOut({ scope: "local" });
    throw new RequestError("Entre para acessar a área restrita.", 401);
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

