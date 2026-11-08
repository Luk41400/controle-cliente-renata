import { test, expect } from "@playwright/test";

const fields = {
  "Nome completo": "Maria de Teste",
  "Nome Social": "Maria",
  "Endereço": "Endereço exclusivamente sintético",
  "RG": "MG-TESTE",
  "CPF": "52998224725",
  "Filiação": "Filiação sintética",
  "Nacionalidade": "Brasileira",
  "Cidade de nascimento": "São Paulo",
  "Caso Jurídico": "Caso sintético para validar a interface.\nSegunda linha.",
};

test("cadastro móvel, navegação por teclado e validação real do endpoint", async ({ page, request, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cadastro de Clientes" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByRole("link", { name: "Advocacia Rodrigues e Alves, página inicial" })).toBeVisible();
  await expect(page.locator("form input:not([type=radio]), form textarea")).toHaveCount(9);
  await expect(page.getByRole("radio", { name: "Administrativo" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Judicial" })).not.toBeChecked();
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByLabel("Nome completo")).toBeFocused();
  await expect(page.getByLabel("Nome completo")).toHaveAttribute("aria-invalid", "true");
  for (const [label, value] of Object.entries(fields)) {
    await page.getByRole("textbox", { name: label, exact: !["Nome Social", "RG", "CPF"].includes(label) }).fill(value);
  }
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.getByText("Selecione Administrativo ou Judicial.")).toBeVisible();
  await page.getByRole("radio", { name: "Administrativo" }).check();
  await expect(page.getByLabel("CPF")).toHaveValue("529.982.247-25");
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("O serviço está indisponível");
  await expect(page.getByLabel("Nome completo")).toHaveValue("Maria de Teste");
  const invalid = await request.post("/api/cadastro", { headers: { Origin: baseURL }, data: {} });
  expect(invalid.status()).toBe(422);
  const crossOrigin = await request.post("/api/cadastro", { headers: { Origin: "https://site-invalido.example" }, data: {} });
  expect(crossOrigin.status()).toBe(403);
  await page.route("**/api/cadastro", (route) => route.fulfill({
    status: 201,
    json: { message: "Cadastro realizado com sucesso! Suas informações foram encaminhadas ao escritório." },
  }));
  await page.getByRole("button", { name: "Enviar cadastro" }).click();
  await expect(page.locator("form").getByRole("status")).toContainText("Cadastro realizado com sucesso!");
  await expect(page.getByLabel("Nome completo")).toHaveValue("");
  await page.getByRole("link", { name: "Política de Privacidade" }).first().click();
  await expect(page.getByRole("heading", { name: "Política de Privacidade" })).toBeVisible();
  await expect(page.getByText("Minuta sujeita à revisão", { exact: false })).toBeVisible();
});

test("área restrita apresenta login e rejeita leitura sem sessão", async ({ page, request, baseURL }) => {
  const admin = await request.post("/api/admin/clientes", {
    headers: { Origin: baseURL }, data: { action: "listar", page: 0 },
  });
  expect(admin.status()).toBe(401);
  expect(admin.headers()["cache-control"]).toContain("no-store");
  const photo = await request.post("/api/admin/foto", {
    headers: { Origin: baseURL }, data: { action: "ver", id: "10000000-0000-4000-8000-000000000001" },
  });
  expect(photo.status()).toBe(401);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Área do advogado" })).toBeVisible();
  await expect(page.getByLabel("Número da OAB")).toBeVisible();
  await expect(page.getByLabel("Estado da OAB (UF)")).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atendimentos", exact: true })).toHaveCount(0);
});

test("interface móvel do painel e da gaveta com respostas simuladas", async ({ page }) => {
  const lawyer = { nome: "Advogada de Teste", oab_numero: "123", oab_uf: "SP", permissao: "gestao" };
  const row = { id: "10000000-0000-4000-8000-000000000001", nome: "Maria de Teste", criado_em: "2026-01-01T12:00:00Z", status: "novo" };
  const client = { ...row, nome_social: "Maria", endereco: fields.Endereço, rg: fields.RG, cpf: fields.CPF, filiacao: fields.Filiação,
    nacionalidade: fields.Nacionalidade, cidade_nascimento: fields["Cidade de nascimento"], caso_juridico: fields["Caso Jurídico"], versao: 0 };
  const notes = [];
  const history = [];
  let authenticated = false;
  await page.route("**/api/admin/sessao", async (route) => {
    const data = route.request().postDataJSON();
    if (route.request().method() === "POST") authenticated = data?.action !== "sair";
    await route.fulfill({ status: authenticated || data?.action === "sair" ? 200 : 401, json: { lawyer } });
  });
  await page.route("**/api/admin/clientes", async (route) => {
    const data = route.request().postDataJSON();
    if (data.action === "listar") {
      const rows = !data.search || row.nome.includes(data.search) ? [row] : [];
      return route.fulfill({ json: { rows, total: rows.length, pageSize: 12, stats: { total: 1, novos: Number(row.status === "novo"), andamento: Number(row.status === "em_andamento"), concluidos: 0 } } });
    }
    if (data.action === "status") {
      history.push({ id: "status", acao: "atualizacao", advogado_nome: lawyer.nome, criado_em: row.criado_em,
        detalhes: { status_anterior: client.status, status_novo: data.status } });
      row.status = data.status;
      client.status = data.status;
      client.versao += 1;
      return route.fulfill({ json: { message: "Status atualizado." } });
    }
    if (data.action === "editar") {
      client.endereco = data.endereco;
      client.versao += 1;
      return route.fulfill({ json: { message: "Informações atualizadas." } });
    }
    if (data.action === "anotar") {
      notes.push({ id: data.noteId, texto: data.text, advogado_nome: lawyer.nome, criado_em: row.criado_em });
      return route.fulfill({ status: 201, json: { message: "Observação registrada." } });
    }
    return route.fulfill({ json: { client, notes: { items: notes, more: false }, history: { items: history, more: false } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByLabel("Número da OAB").fill("123");
  await page.getByLabel("Estado da OAB (UF)").selectOption("SP");
  await page.getByLabel("Senha").fill("apenas-um-valor-sintetico");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Atendimentos", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByLabel("Nome do cliente").fill("Inexistente");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
  await page.getByRole("button", { name: "Limpar" }).click();
  await page.getByRole("button", { name: "Visualizar Maria de Teste" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Segunda linha.", { exact: false })).toBeVisible();
  await expect(drawer.getByText("529.982.247-25")).toBeVisible();
  await drawer.getByLabel("Status do caso").selectOption("em_andamento");
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: "Salvar status" }).click();
  await expect(drawer.getByText("Status atualizado.")).toBeVisible();
  await expect(drawer.getByText("Status alterado de Novo para Em andamento")).toBeVisible();
  await drawer.getByRole("button", { name: "Editar", exact: true }).click();
  await drawer.getByLabel("Endereço").fill("Endereço editado durante o teste");
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: "Salvar informações" }).click();
  await expect(drawer.getByText("Endereço editado durante o teste")).toBeVisible();
  await drawer.getByLabel("Nova observação").fill("Observação exclusivamente sintética.");
  await drawer.getByRole("button", { name: "Adicionar observação" }).click();
  await expect(drawer.getByText("Observação exclusivamente sintética.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("heading", { name: "Área do advogado" })).toBeVisible();
});
