import { fields, isStatus, isUuid, validateClient } from "@/lib/clientes";
import { body, failure, json, problem, RequestError } from "@/lib/server/http";
import { requireLawyer } from "@/lib/server/supabase";
import { checkDatabase, tryCleanupPhotos } from "@/lib/server/client-lifecycle";

type Authorized = Awaited<ReturnType<typeof requireLawyer>>;
type Database = Authorized["client"];
const PAGE_SIZE = 12;
const TIMELINE_SIZE = 10;
const detailColumns = "id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico,criado_em,status,versao,foto_path,arquivado_em";

function pageIndex(value: unknown) {
  if (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000) return Number(value);
  throw new RequestError("Página inválida.", 422);
}

function dateFilter(value: unknown) {
  if (value === "" || value == null) return null;
  if (typeof value === "string" && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value) return value;
  }
  throw new RequestError("Informe uma data válida.", 422);
}

async function dashboard(db: Database, input: Record<string, unknown>) {
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const status = input.status === "" ? null : input.status;
  const start = dateFilter(input.start);
  const end = dateFilter(input.end);
  if (search.length > 200 || search.includes("\0") || (status != null && !isStatus(status))) return problem("Confira os filtros.", 422);
  if (start && end && start > end) return problem("A data final deve ser igual ou posterior à inicial.", 422);
  const page = pageIndex(input.page);
  const archived = input.archived === true;
  const orderByName = input.order === "nome";
  const [list, stats] = await Promise.all([
    db.rpc("adv_listar_clientes_v2", { p_nome: search, p_status: status ?? null, p_inicio: start, p_fim: end, p_arquivados: archived }, { count: "exact" })
      .order(orderByName ? "nome" : "criado_em", { ascending: orderByName })
      .order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    db.rpc("adv_totais_clientes_v2", { p_arquivados: archived }),
  ]);
  if (stats.error) throw stats.error;
  if (list.error && list.status !== 416) throw list.error;
  return json({ rows: list.data ?? [], total: list.count ?? 0, pageSize: PAGE_SIZE, stats: stats.data });
}

async function timeline(db: Database, id: string, kind: "observacoes" | "historico", page: number) {
  const start = page * TIMELINE_SIZE;
  const query = kind === "observacoes"
    ? db.from("adv_observacoes").select("id,texto,advogado_nome,criado_em")
    : db.from("adv_auditoria").select("id,acao,advogado_nome,criado_em,detalhes");
  const { data, error } = await query.eq("cliente_id", id)
    .order("criado_em", { ascending: false }).order("id", { ascending: false })
    .range(start, start + TIMELINE_SIZE);
  if (error) throw error;
  return { items: data.slice(0, TIMELINE_SIZE), more: data.length > TIMELINE_SIZE };
}

async function details(db: Database, id: string) {
  const [result, notes, history, retention] = await Promise.all([
    db.from("adv_clientes").select(detailColumns).eq("id", id).maybeSingle(),
    timeline(db, id, "observacoes", 0),
    timeline(db, id, "historico", 0),
    db.rpc("adv_cliente_pode_excluir", { p_id: id }),
  ]);
  if (result.error) throw result.error;
  checkDatabase(retention.error);
  if (!result.data) return problem("Cadastro não encontrado.", 404);
  return json({ client: { ...result.data, tem_foto: Boolean(result.data.foto_path) }, notes, history, canDelete: retention.data === true });
}

async function update(db: Database, id: string, input: Record<string, unknown>) {
  const version = input.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) return problem("Atualize os detalhes do cadastro.", 422);
  let changes;
  if (input.action === "status") {
    if (!isStatus(input.status)) return problem("Selecione um status válido.", 422);
    changes = { status: input.status };
  } else {
    const { data, errors, valid } = validateClient(input, true);
    if (!valid) return json({ message: "Confira os campos indicados.", errors }, 422);
    const changedFields = fields.filter(({ key }) => Object.hasOwn(input, key));
    if (!changedFields.length) return problem("Altere algum campo antes de salvar.", 422);
    changes = Object.fromEntries(changedFields.map(({ key }) => [key, ["nome_social", "rg", "cpf"].includes(key) ? data[key] || null : data[key]]));
  }
  const { data, error } = await db.from("adv_clientes").update(changes).eq("id", id)
    .eq("versao", version).select(detailColumns).maybeSingle();
  if (error) throw error;
  if (!data) return problem("O cadastro foi alterado. Atualize os detalhes antes de salvar.", 409);
  return json({ client: data, message: input.action === "status" ? "Status atualizado." : "Informações atualizadas." });
}

async function deletionState(db: Database, id: string, operation: string) {
  await tryCleanupPhotos(id);
  const state = await db.rpc("adv_cliente_exclusao_estado", { p_operacao: operation });
  checkDatabase(state.error);
  const completed = state.data === "concluida";
  return json({
    message: completed ? "Cliente excluído com sucesso." : "Exclusão autorizada em processamento. A remoção definitiva aguarda a limpeza dos arquivos.",
    pending: !completed, operation, id,
  }, completed ? 200 : 202);
}

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const { client, lawyer, lawyerId } = await requireLawyer();
    if (input.action === "listar") return await dashboard(client, input);
    if (!isUuid(input.id)) return problem("Cadastro inválido.", 422);
    if (input.action === "detalhes") return await details(client, input.id);
    if (input.action === "observacoes" || input.action === "historico") {
      return json(await timeline(client, input.id, input.action, pageIndex(input.page)));
    }
    if (lawyer.permissao !== "gestao") return problem("Seu perfil permite apenas consulta.", 403);
    if (input.action === "exclusao_estado") {
      if (!isUuid(input.operation)) return problem("Operação inválida.", 422);
      return await deletionState(client, input.id, input.operation);
    }
    if (input.action === "status" || input.action === "editar") return await update(client, input.id, input);
    if (input.action === "arquivar" || input.action === "restaurar" || input.action === "excluir") {
      if (typeof input.version !== "number" || !Number.isSafeInteger(input.version) || input.version < 0) {
        return problem("Atualize os detalhes do cadastro.", 422);
      }
      if (input.action === "excluir") {
        if (!isUuid(input.operation)) return problem("Atualize os detalhes do cadastro.", 422);
        const started = await client.rpc("adv_cliente_excluir", { p_id: input.id, p_versao: input.version, p_operacao: input.operation });
        checkDatabase(started.error);
        return await deletionState(client, input.id, input.operation);
      }
      const result = await client.rpc("adv_cliente_arquivar", { p_id: input.id, p_versao: input.version, p_arquivar: input.action === "arquivar" });
      checkDatabase(result.error);
      return json({ message: input.action === "arquivar" ? "Cliente arquivado com sucesso." : "Cliente restaurado com sucesso." });
    }
    if (input.action === "anotar") {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text || text.length > 10000 || text.includes("\0") || /\p{Cs}/u.test(text)) return problem("Escreva uma observação de até 10.000 caracteres.", 422);
      if (!isUuid(input.noteId)) return problem("Atualize os detalhes e tente novamente.", 422);
      const result = await client.from("adv_observacoes").insert({
        id: input.noteId, cliente_id: input.id, advogado_id: lawyerId, texto: text,
      });
      if (result.error?.code === "23505") {
        const existing = await client.from("adv_observacoes").select("texto").eq("id", input.noteId)
          .eq("cliente_id", input.id).eq("advogado_id", lawyerId).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data?.texto !== text) return problem("Atualize os detalhes e tente novamente.", 409);
      } else if (result.error) throw result.error;
      return json({ message: "Observação registrada." }, 201);
    }
    return problem("Operação inválida.", 422);
  } catch (error) {
    return failure(error);
  }
}

