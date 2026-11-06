import { ufs } from "@/lib/clientes";
import { body, failure, json, problem, sourceIp } from "@/lib/server/http";
import { allowAttempt, lawyerProfile, requireLawyer, sessionClient, systemClient } from "@/lib/server/supabase";

const invalid = () => problem("OAB, UF ou senha inválidos.", 401);

export async function GET() {
  try {
    const { lawyer } = await requireLawyer();
    return json({ lawyer });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await body(request);
    if (input.action === "sair") {
      const client = await sessionClient();
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error && error.code !== "session_not_found" && error.name !== "AuthSessionMissingError") throw error;
      return json({ ok: true });
    }
    const number = typeof input.oab === "string" ? input.oab.trim() : "";
    const uf = input.uf;
    const password = input.senha;
    if (!number || number.length > 20 || /[\p{Cc}\p{Cs}]/u.test(number) || typeof uf !== "string" || !ufs.includes(uf) ||
        typeof password !== "string" || !password || password.length > 256) return invalid();

    const normalized = number.toUpperCase();
    const ip = sourceIp(request);
    const allowedIp = await allowAttempt("login:ip", ip, 900, 25);
    const allowedAccount = allowedIp && await allowAttempt("login:oab-ip", `${uf}:${normalized}:${ip}`, 900, 6);
    const allowedGlobalAccount = allowedAccount && await allowAttempt("login:oab", `${uf}:${normalized}`, 900, 30);
    if (!allowedGlobalAccount) return json({ message: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429, { "Retry-After": "900" });

    const system = systemClient();
    const { data: profile, error: lookupError } = await system.from("adv_advogados")
      .select("auth_user_id,email_login").eq("oab_numero", number).eq("oab_uf", uf).eq("ativo", true).maybeSingle();
    if (lookupError) throw lookupError;
    if (!profile) return invalid();
    const client = await sessionClient();
    const { data, error } = await client.auth.signInWithPassword({ email: profile.email_login, password });
    if (error?.status === 429) return json({ message: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, 429, { "Retry-After": "900" });
    if (error?.status && error.status >= 500) throw error;
    if (!data.user) return invalid();
    let authorized = false;
    try {
      const authorizedProfile = data.user.id === profile.auth_user_id && await lawyerProfile(client, data.user.id);
      if (!authorizedProfile) return invalid();
      authorized = true;
      return json({ lawyer: authorizedProfile.lawyer });
    } finally {
      if (!authorized) await client.auth.signOut({ scope: "local" });
    }
  } catch (error) {
    return failure(error);
  }
}

