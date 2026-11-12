import { createHash } from "node:crypto";
import { isUuid, validateClient } from "@/lib/clientes";
import { normalizePhoto } from "@/lib/image-processing";
import { PHOTO_BUCKET, photoPath } from "@/lib/photo-rules";
import { body, digest, failure, json, problem, sourceIp, route } from "@/lib/server/http";
import { allowAttempt, systemClient } from "@/lib/server/supabase";

export const maxDuration = 60;

async function register(request: Request) {
  try {
    // Limite técnico do corpo HTTP; o campo de andamento não tem limite próprio.
    const input = await body(request, 3_500_000);
    const { data, errors, valid } = validateClient(input);
    const envio = input.envio;
    if (!valid) return json({ message: "Confira os campos indicados.", errors }, 422);
    if (!isUuid(envio)) return problem("Atualize a página e tente novamente.", 400);
    const allowed = await allowAttempt("cadastro:ip", sourceIp(request), 3600, 12);
    if (!allowed) return json({ message: "Muitos envios recentes. Aguarde e tente novamente mais tarde." }, 429, { "Retry-After": "3600" });

    let photo: Buffer | undefined;
    if (input.image != null) {
      if (typeof input.image !== "string" || !input.image || input.image.length > 2_800_000 || input.image.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.image)) return problem("Selecione uma fotografia válida de até 5 MB.", 422);
      try { photo = await normalizePhoto(Buffer.from(input.image, "base64")); }
      catch { return problem("A fotografia não pôde ser processada. Use JPG, PNG ou WEBP de até 5 MB.", 422); }
    }
    const hash = digest("cadastro:conteudo", JSON.stringify({ ...data, imageHash: photo ? createHash("sha256").update(photo).digest("hex") : null }));
    const system = systemClient(10_000);
    if (photo) {
      const reservation = await system.rpc("adv_cadastro_foto_preparar", { p_envio: envio, p_hash: hash });
      if (reservation.error?.code === "40001" || reservation.error?.code === "22023") return problem("O envio expirou ou foi alterado. Envie o formulário novamente.", 409);
      if (reservation.error) throw reservation.error;
      const op = reservation.data as { path?: string; concluida: boolean };
      if (op.concluida) return json({ message: "Cadastro realizado com sucesso! Suas informações foram encaminhadas ao escritório." }, 201);
      if (!photoPath(op.path) || !op.path.endsWith(`/${envio}.webp`)) throw new Error("Caminho inesperado.");
      const upload = await system.storage.from(PHOTO_BUCKET).upload(op.path, photo, { contentType: "image/webp", upsert: false, cacheControl: "0" });
      if (upload.error && String(upload.error.statusCode) !== "409") throw upload.error;
    }
    const { data: saved, error } = await system.rpc(photo ? "adv_registrar_cliente_com_foto" : "adv_registrar_cliente", {
      p_dados: data,
      p_envio: envio,
      p_hash: hash,
    });
    if (error?.code === "40001") return problem("O envio expirou. Envie o formulário novamente.", 409);
    if (error) throw error;
    if (saved !== true) return problem("O formulário foi alterado durante o envio. Tente enviá-lo novamente.", 409);
    return json({ message: "Cadastro realizado com sucesso! Suas informações foram encaminhadas ao escritório." }, 201);
  } catch (error) {
    return failure(error);
  }
}

export const POST = route(register);

