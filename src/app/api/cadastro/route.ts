import { isUuid, validateClient } from "@/lib/clientes";
import { body, digest, failure, json, problem, sourceIp } from "@/lib/server/http";
import { allowAttempt, systemClient } from "@/lib/server/supabase";

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const { data, errors, valid } = validateClient(input);
    const envio = input.envio;
    if (!valid) return json({ message: "Confira os campos indicados.", errors }, 422);
    if (!isUuid(envio)) return problem("Atualize a página e tente novamente.", 400);
    const allowed = await allowAttempt("cadastro:ip", sourceIp(request), 3600, 12);
    if (!allowed) return json({ message: "Muitos envios recentes. Aguarde e tente novamente mais tarde." }, 429, { "Retry-After": "3600" });

    const { data: saved, error } = await systemClient().rpc("adv_registrar_cliente", {
      p_dados: data,
      p_envio: envio,
      p_hash: digest("cadastro:conteudo", JSON.stringify(data)),
    });
    if (error) throw error;
    if (saved !== true) return problem("O formulário foi alterado durante o envio. Tente enviá-lo novamente.", 409);
    return json({ message: "Cadastro realizado com sucesso! Suas informações foram encaminhadas ao escritório." }, 201);
  } catch (error) {
    return failure(error);
  }
}

