import sharp from "sharp";

export async function adminFixture(page, { missingDocuments = true, canDelete = false } = {}) {
  const image = await sharp({ create: { width: 60, height: 80, channels: 3, background: "#a1b5c4" } }).png().toBuffer();
  const row = {
    id: "10000000-0000-4000-8000-000000000001", nome: "Cliente Sintética", criado_em: "2026-01-01T12:00:00Z",
    status: "novo", tipo_caso: null, arquivado_em: null, tem_foto: false,
  };
  const state = {
    authenticated: false, exists: true, canDelete, deletionPending: false, photoSaves: 0, photoRemovals: 0, archiveCalls: 0, deletionCalls: 0,
    client: { ...row, nome_social: null, endereco: "Endereço sintético", rg: missingDocuments ? null : "RG-TESTE", cpf: missingDocuments ? null : "52998224725",
      filiacao: "Filiação sintética", nacionalidade: "Brasileira", cidade_nascimento: "São Paulo", caso_juridico: "Relato jurídico completo de teste.", andamento_caso: null, foto_path: null, versao: 0 },
    notes: [],
    history: [{ id: "cadastro", acao: "cadastro", advogado_nome: null, criado_em: row.criado_em, detalhes: {} }],
  };
  const lawyer = { nome: "Advogada de Teste", oab_numero: "123", oab_uf: "SP", permissao: "gestao" };
  function event(action, details = {}) {
    state.history.unshift({ id: String(state.history.length), acao: action, advogado_nome: lawyer.nome, criado_em: row.criado_em, detalhes: details });
  }
  await page.route("**/api/admin/sessao", async (route) => {
    const data = route.request().postDataJSON();
    if (route.request().method() === "POST") state.authenticated = data?.action !== "sair";
    await route.fulfill({ status: state.authenticated || data?.action === "sair" ? 200 : 401, json: { lawyer } });
  });
  await page.route("**/api/admin/clientes", async (route) => {
    const data = route.request().postDataJSON();
    if (data.action === "listar") {
      const archived = Boolean(state.client.arquivado_em);
      const inView = state.exists && archived === Boolean(data.archived);
      const matches = !data.search || state.client.nome.toLowerCase().includes(data.search.toLowerCase());
      const rows = inView && matches ? [{ ...row, ...state.client }] : [];
      return route.fulfill({ json: { rows, total: rows.length, pageSize: 12, stats: {
        total: Number(inView), novos: Number(inView && state.client.status === "novo"), andamento: Number(inView && state.client.status === "em_andamento"),
        concluidos: 0, ativos: Number(state.exists && !archived), arquivados: Number(state.exists && archived),
      } } });
    }
    if (data.action === "editar") {
      const changed = ["nome","nome_social","endereco","rg","cpf","filiacao","nacionalidade","cidade_nascimento","tipo_caso","caso_juridico","andamento_caso"].filter((key) => Object.hasOwn(data,key));
      for (const key of changed) state.client[key] = data[key] || null;
      state.client.versao++;
      event("atualizacao", { campos: changed });
      return route.fulfill({ json: { message: "Informações atualizadas." } });
    }
    if (data.action === "arquivar" || data.action === "restaurar") {
      state.archiveCalls++;
      state.client.arquivado_em = data.action === "arquivar" ? "2026-01-02T12:00:00Z" : null;
      state.client.versao++;
      event(data.action === "arquivar" ? "arquivamento" : "restauracao");
      return route.fulfill({ json: { message: data.action === "arquivar" ? "Cliente arquivado com sucesso." : "Cliente restaurado com sucesso." } });
    }
    if (data.action === "excluir") {
      if (!state.canDelete) return route.fulfill({ status: 403, json: { message: "Exclusão bloqueada por retenção." } });
      state.exists = false;
      state.deletionCalls++;
      return route.fulfill({ status: state.deletionPending ? 202 : 200, json: {
        message: state.deletionPending ? "Exclusão autorizada em processamento. A remoção definitiva aguarda a limpeza dos arquivos." : "Cliente excluído com sucesso.",
        pending: state.deletionPending, id: state.client.id, operation: data.operation,
      } });
    }
    if (data.action === "exclusao_estado") return route.fulfill({ json: {
      message: state.deletionPending ? "Exclusão autorizada em processamento." : "Cliente excluído com sucesso.", pending: state.deletionPending,
      id: state.client.id, operation: data.operation,
    } });
    return route.fulfill({ json: { client: state.client, canDelete: state.canDelete, notes: { items: state.notes, more: false }, history: { items: state.history, more: false } } });
  });
  await page.route("**/api/admin/foto", async (route) => {
    const data = route.request().postDataJSON();
    if (data.action === "ver") return route.fulfill({ contentType: "image/png", body: image });
    if (data.action === "salvar") {
      const updated = state.client.foto_path !== null;
      state.photoSaves++;
      state.client.foto_path = state.client.id + "/" + data.operation + ".webp";
      state.client.tem_foto = true;
      state.client.versao++;
      event(updated ? "foto_atualizada" : "foto_adicionada");
      return route.fulfill({ json: { message: updated ? "Foto atualizada com sucesso." : "Foto adicionada com sucesso." } });
    }
    if (data.action === "remover") {
      state.photoRemovals++;
      state.client.foto_path = null;
      state.client.tem_foto = false;
      state.client.versao++;
      event("foto_removida");
      return route.fulfill({ json: { message: "Foto removida com sucesso." } });
    }
    return route.fulfill({ json: { message: "Limpeza de arquivos verificada." } });
  });
  return { state, image };
}

export async function login(page) {
  await page.goto("/admin");
  await page.getByLabel("Número da OAB").fill("123");
  await page.getByLabel("Estado da OAB (UF)").selectOption("SP");
  await page.getByLabel("Senha").fill("valor-exclusivamente-sintetico");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Atendimentos", exact: true }).waitFor();
}
