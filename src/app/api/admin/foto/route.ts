import { createHash } from "node:crypto";
import { isUuid } from "@/lib/clientes";
import { normalizePhoto } from "@/lib/image-processing";
import { PHOTO_BUCKET, photoPath } from "@/lib/photo-rules";
import { body, failure, json, problem, RequestError } from "@/lib/server/http";
import { requireLawyer, systemClient } from "@/lib/server/supabase";
import { checkDatabase, tryCleanupPhotos } from "@/lib/server/client-lifecycle";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { client, lawyer } = await requireLawyer();
    const input = await body(request, 3_000_000);
    if (!isUuid(input.id)) return problem("Cadastro inválido.", 422);
    if (input.action === "ver") {
      const row = await client.from("adv_clientes").select("foto_path").eq("id", input.id).maybeSingle();
      checkDatabase(row.error);
      if (!row.data?.foto_path || !photoPath(row.data.foto_path)) return problem("Fotografia não encontrada.", 404);
      const { data, error } = await client.storage.from(PHOTO_BUCKET).download(row.data.foto_path);
      if (error || !data) return problem("Não foi possível carregar a fotografia.", 503);
      return new Response(await data.arrayBuffer(), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (lawyer.permissao !== "gestao") return problem("Seu perfil permite apenas consulta.", 403);
    if (input.action === "limpar") {
      const completed = await tryCleanupPhotos(input.id);
      return json({ message: completed ? "Limpeza de arquivos verificada." : "A limpeza dos arquivos continua em processamento.", cleanupPending: !completed }, completed ? 200 : 202);
    }
    const version = input.version;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) return problem("Atualize os detalhes do cadastro.", 422);
    if (input.action === "remover") {
      const result = await client.rpc("adv_foto_remover", { p_id: input.id, p_versao: version });
      checkDatabase(result.error);
      const completed = await tryCleanupPhotos(input.id);
      return json({
        message: completed ? "Foto removida com sucesso." : "Foto removida do cadastro. A limpeza do arquivo está em processamento.",
        cleanupPending: !completed,
      }, completed ? 200 : 202);
    }
    if (input.action !== "salvar" || !isUuid(input.operation)) return problem("Operação inválida.", 422);
    if (typeof input.image !== "string" || !input.image || input.image.length > 2_800_000 ||
      input.image.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.image)) {
      return problem("Selecione uma imagem JPG, PNG ou WEBP de até 5 MB.", 422);
    }
    let normalized: Buffer;
    try {
      normalized = await normalizePhoto(Buffer.from(input.image, "base64"));
    } catch {
      throw new RequestError("A imagem não pôde ser processada. Selecione um JPG, PNG ou WEBP válido de até 5 MB.", 422);
    }
    const prepared = await client.rpc("adv_foto_preparar", {
      p_id: input.id, p_versao: version, p_operacao: input.operation,
      p_hash: createHash("sha256").update(normalized).digest("hex"),
    });
    checkDatabase(prepared.error);
    const op = prepared.data as { path: string; concluida: boolean; substituicao: boolean };
    if (!photoPath(op.path) || op.path !== `${input.id}/${input.operation}.webp`) throw new Error("Caminho inesperado.");
    if (!op.concluida) {
      const upload = await systemClient(20_000).storage.from(PHOTO_BUCKET).upload(op.path, normalized, {
        contentType: "image/webp", upsert: false, cacheControl: "0",
      });
      // Uma repetição após perda da resposta pode encontrar o mesmo objeto já gravado.
      if (upload.error && String(upload.error.statusCode) !== "409") throw upload.error;
      const saved = await client.rpc("adv_foto_concluir", { p_operacao: input.operation });
      checkDatabase(saved.error);
    }
    const completed = await tryCleanupPhotos(input.id);
    return json({
      message: op.substituicao ? "Foto atualizada com sucesso." : "Foto adicionada com sucesso.",
      cleanupPending: !completed,
    });
  } catch (error) {
    return failure(error);
  }
}
