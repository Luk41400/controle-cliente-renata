import { test, expect } from "@playwright/test";
import { adminFixture, login } from "./admin-fixture.mjs";

test("formulário aceita documentos ausentes e exige a classificação", async ({ page }) => {
  const sent = [];
  await page.route("**/api/cadastro", async (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { message: "Cadastro realizado com sucesso! Suas informações foram encaminhadas ao escritório." } });
  });
  await page.goto("/");
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  for (const [rg, cpf, type] of [["","", "Administrativo"], ["RG-TESTE","", "Judicial"], ["","52998224725", "Administrativo"], ["RG-TESTE","52998224725", "Judicial"]]) {
    const data = { "Nome completo": "Pessoa Sintética", "Endereço": "Endereço sintético", "Filiação": "Filiação sintética", "Nacionalidade": "Brasileira", "Cidade de nascimento": "São Paulo", "Caso Jurídico": "Relato jurídico sintético." };
    for (const [label,value] of Object.entries(data)) await page.getByRole("textbox", { name: label, exact: true }).fill(value);
    await page.getByRole("textbox", { name: "RG Opcional", exact: true }).fill(rg);
    await page.getByRole("textbox", { name: "CPF Opcional", exact: true }).fill(cpf);
    await page.getByRole("radio", { name: type, exact: true }).check();
    await page.getByRole("button", { name: "Enviar cadastro" }).click();
    await expect(page.getByRole("textbox", { name: "Nome completo", exact: true })).toHaveValue("");
  }
  expect(sent).toHaveLength(4);
  expect(sent.map((data) => [data.rg,data.cpf,data.tipo_caso])).toEqual([
    ["","","administrativo"],["RG-TESTE","","judicial"],["","52998224725","administrativo"],["RG-TESTE","52998224725","judicial"],
  ]);
});

test("documentos e tipo podem ser acrescentados, corrigidos e consultados novamente", async ({ page }) => {
  const { state } = await adminFixture(page);
  await login(page);
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  const drawer = page.getByRole("dialog", { name: "Cliente Sintética", exact: true });
  for (const [document,value] of [["RG","RG-TESTE"],["CPF","52998224725"]]) {
    await drawer.getByRole("button", { name: "Adicionar " + document, exact: true }).click();
    await drawer.getByRole("textbox", { name: document + " Opcional", exact: true }).fill(value);
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("button", { name: "Salvar informações" }).click();
    await expect(drawer.getByRole("button", { name: "Editar " + document, exact: true })).toBeVisible();
  }
  await drawer.getByRole("button", { name: "Editar CPF", exact: true }).click();
  await drawer.getByLabel("CPF Opcional").fill("11111111111");
  await drawer.getByRole("button", { name: "Salvar informações" }).click();
  await expect(drawer.getByText("Informe um CPF válido com 11 dígitos.")).toBeVisible();
  await drawer.getByLabel("CPF Opcional").fill("52998224725");
  await drawer.getByRole("button", { name: "Salvar informações" }).click();
  // Valor igual ao original encerra a edição e conserva o documento.
  await drawer.getByRole("button", { name: "Adicionar classificação" }).click();
  await drawer.getByRole("radio", { name: "Judicial", exact: true }).check();
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: "Salvar informações" }).click();
  await expect(drawer.getByText("Judicial", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Editar RG", exact: true }).click();
  await drawer.getByLabel("RG Opcional").fill("");
  page.once("dialog", (dialog) => dialog.accept());
  await drawer.getByRole("button", { name: "Salvar informações" }).click();
  await expect(drawer.getByRole("button", { name: "Adicionar RG", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar detalhes" }).click();
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  await expect(drawer.getByText("529.982.247-25", { exact: true })).toBeVisible();
  expect(state.client.rg).toBeNull();
  expect(state.client.tipo_caso).toBe("judicial");
  expect(JSON.stringify(state.history)).not.toContain("52998224725");
});

test("foto com prévia, cancelamento, troca, remoção e preservação durante arquivo e restauração", async ({ page }) => {
  const { state, image } = await adminFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  const drawer = page.getByRole("dialog", { name: "Cliente Sintética", exact: true });
  const file = drawer.getByLabel("Selecionar foto do cliente");
  await file.setInputFiles({ name: "falsa.jpg", mimeType: "image/jpeg", buffer: Buffer.from("arquivo inválido") });
  await expect(drawer.getByText("Use uma imagem JPG, JPEG, PNG ou WEBP.")).toBeVisible();
  await file.setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(drawer.getByText("Escolha uma imagem de até 5 MB.")).toBeVisible();
  const selected = { name: "foto.png", mimeType: "image/png", buffer: image };
  await file.setInputFiles(selected);
  await expect(drawer.getByRole("img", { name: "Pré-visualização do recorte" })).toBeVisible();
  await drawer.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(state.photoSaves).toBe(0);
  for (const message of ["Foto adicionada com sucesso.", "Foto atualizada com sucesso."]) {
    await file.setInputFiles(selected);
    await expect(drawer.getByRole("button", { name: "Salvar foto", exact: true })).toBeEnabled();
    await drawer.getByRole("button", { name: "Salvar foto", exact: true }).click();
    await expect(drawer.getByText(message, { exact: true })).toBeVisible();
    await expect(drawer.getByRole("img", { name: "Fotografia do cliente", exact: true })).toBeVisible();
  }
  expect(state.photoSaves).toBe(2);
  await expect(drawer.getByRole("img", { name: "Fotografia do cliente", exact: true })).toHaveAttribute("src", /^blob:/);
  const path = state.client.foto_path;
  const legalStatus = state.client.status;
  await drawer.getByRole("button", { name: "Arquivar cliente", exact: true }).click();
  let confirm = page.getByRole("dialog", { name: "Arquivar cliente?", exact: true });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(state.archiveCalls).toBe(0);
  await drawer.getByRole("button", { name: "Arquivar cliente", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirmar arquivamento", exact: true }).click();
  await expect(page.getByText("Cliente arquivado com sucesso.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Visualizar Cliente Sintética" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Listas de clientes" }).getByRole("button", { name: /Clientes Arquivados/ }).click();
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  await expect(drawer.locator(".archive-badge")).toHaveText("Cliente arquivado");
  await expect(drawer.getByRole("img", { name: "Fotografia do cliente", exact: true })).toBeVisible();
  expect(state.client.foto_path).toBe(path);
  expect(state.client.status).toBe(legalStatus);
  await drawer.getByRole("button", { name: "Restaurar cliente", exact: true }).click();
  confirm = page.getByRole("dialog", { name: "Restaurar cliente?", exact: true });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(state.archiveCalls).toBe(1);
  await drawer.getByRole("button", { name: "Restaurar cliente", exact: true }).click();
  await confirm.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page.getByRole("navigation", { name: "Listas de clientes" }).getByRole("button", { name: /Clientes ativos/ }).click();
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  await drawer.getByRole("button", { name: "Remover foto", exact: true }).click();
  confirm = page.getByRole("dialog", { name: "Remover foto do cliente?", exact: true });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(state.photoRemovals).toBe(0);
  await drawer.getByRole("button", { name: "Remover foto", exact: true }).click();
  await confirm.getByRole("button", { name: "Remover foto", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "Adicionar foto", exact: true })).toBeVisible();
  expect(state.client.foto_path).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("exclusão exige liberação e confirmação, com botões depois do histórico", async ({ page }) => {
  const { state } = await adminFixture(page);
  await login(page);
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  const drawer = page.getByRole("dialog", { name: "Cliente Sintética", exact: true });
  await expect(drawer.getByRole("button", { name: "Excluir cliente", exact: true })).toBeDisabled();
  await expect(drawer.getByText("Exclusão bloqueada por retenção.", { exact: false })).toBeVisible();
  expect(await drawer.locator(".timeline button").count()).toBe(0);
  expect(await drawer.locator(".client-final-actions").evaluate((actions) => Boolean(actions.previousElementSibling?.textContent.includes("Cadastro recebido")))).toBe(true);
  state.canDelete = true;
  await drawer.getByRole("button", { name: "Fechar detalhes" }).click();
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  await drawer.getByRole("button", { name: "Excluir cliente", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Tem certeza de que deseja excluir este cliente?", exact: true });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(state.deletionCalls).toBe(0);
  expect(state.exists).toBe(true);
  await drawer.getByRole("button", { name: "Excluir cliente", exact: true }).click();
  await confirm.getByRole("button", { name: "Sim, excluir cliente", exact: true }).click();
  await expect(page.getByText("Cliente excluído com sucesso.", { exact: true })).toBeVisible();
  expect(state.deletionCalls).toBe(1);
  await expect(page.getByRole("button", { name: "Visualizar Cliente Sintética" })).toHaveCount(0);
});

test("exclusão pendente permite verificar a conclusão após recuperar o Storage", async ({ page }) => {
  const { state } = await adminFixture(page, { canDelete: true });
  state.deletionPending = true;
  await login(page);
  await page.getByRole("button", { name: "Visualizar Cliente Sintética" }).click();
  await page.getByRole("button", { name: "Excluir cliente", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Tem certeza de que deseja excluir este cliente?", exact: true });
  await confirm.getByRole("button", { name: "Sim, excluir cliente", exact: true }).click();
  await expect(page.locator(".notice[role=status]")).toContainText("Exclusão autorizada em processamento.");
  await expect(page.getByText("Cliente excluído com sucesso.", { exact: true })).toHaveCount(0);
  state.deletionPending = false;
  await page.getByRole("button", { name: "Verificar exclusão" }).click();
  await expect(page.getByText("Cliente excluído com sucesso.", { exact: true })).toBeVisible();
});
