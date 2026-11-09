import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { adminFixture, login } from "./admin-fixture.mjs";

async function fillRegistration(page) {
  for (const [label,value] of Object.entries({ "Nome completo":"Pessoa Sintética", "Endereço":"Rua sintética", "Filiação":"Filiação sintética", "Nacionalidade":"Brasileira", "Cidade de nascimento":"São Paulo", "Caso Jurídico":"Relato sintético para teste." })) await page.getByRole("textbox",{name:label,exact:true}).fill(value);
  await page.getByRole("radio",{name:"Administrativo",exact:true}).check();
}

async function assertStableCrop(page, container) {
  const image=container.getByRole("img",{name:"Pré-visualização do recorte",exact:true});
  await expect(image).toBeVisible();
  const src=await image.getAttribute("src");
  await image.evaluate(e=>{e.dataset.stable="same-image";});
  const before=await image.getAttribute("style");
  for(const label of ["Aproximação","Posição horizontal","Posição vertical"]) {
    const slider=container.getByRole("slider",{name:label,exact:true});
    await slider.focus();
    for(let i=0;i<8;i++)await slider.press("ArrowRight");
    await expect(image).toBeVisible();await expect(image).toHaveAttribute("src",src);await expect(image).toHaveAttribute("data-stable","same-image");
    expect(await slider.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  expect(await image.getAttribute("style")).not.toBe(before);
  await expect(container.getByText("Preparando imagem…",{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test("cadastro com foto mantém prévia estável, enquadra e envia junto do andamento; reenvio é idempotente",async({page})=>{
  await page.setViewportSize({width:390,height:900});
  const image=await sharp({create:{width:900,height:600,channels:3,background:"#b38748"}}).png().toBuffer();
  const sent=[];
  await page.route("**/api/cadastro",async route=>{sent.push(route.request().postDataJSON());await route.fulfill({status:sent.length===1?503:201,json:{message:sent.length===1?"Falha sintética temporária.":"Cadastro realizado com sucesso!"}});});
  await page.goto("/");await fillRegistration(page);
  expect(await page.getByRole("radio",{name:"Administrativo",exact:true}).evaluate(e=>Boolean(e.compareDocumentPosition(document.getElementById("cadastro-nome"))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const progress=page.getByRole("textbox",{name:"Andamento do caso Opcional",exact:true});
  await expect(progress).not.toHaveAttribute("maxlength");
  const text="  Primeiro parágrafo.\n\n"+"Atualização do processo. ".repeat(1500)+"\nÚltima linha.\n";
  await progress.fill(text);
  await page.getByLabel("Selecionar foto do cliente").setInputFiles({name:"sintetica.png",mimeType:"image/png",buffer:image});
  await assertStableCrop(page,page.locator(".intake-photo"));
  await page.getByRole("button",{name:"Enviar cadastro",exact:true}).click();await expect(page.locator("form").getByRole("alert")).toContainText("Falha sintética");
  await expect(progress).toHaveValue(text);await expect(page.getByRole("img",{name:"Pré-visualização do recorte"})).toBeVisible();
  await page.getByRole("button",{name:"Enviar cadastro",exact:true}).click();await expect(page.getByRole("status")).toContainText("Cadastro realizado");
  expect(sent.length).toBe(2);expect(sent[0].envio).toBe(sent[1].envio);expect(sent[0].image).toBe(sent[1].image);expect(sent[0].andamento_caso).toBe(text);
  const metadata=await sharp(Buffer.from(sent[0].image,"base64")).metadata();expect(metadata.format).toBe("webp");expect([metadata.width,metadata.height]).toEqual([768,768]);
  await expect(page.getByRole("img",{name:"Pré-visualização do recorte"})).toHaveCount(0);await expect(progress).toHaveValue("");
});

test("foto opcional pode ser substituída e removida antes do cadastro sem upload",async({page})=>{
  let photoRequests=0;await page.route("**/api/admin/foto",route=>{photoRequests++;return route.fulfill({status:401,json:{}});});
  let received;await page.route("**/api/cadastro",route=>{received=route.request().postDataJSON();return route.fulfill({status:201,json:{message:"Cadastro realizado com sucesso!"}});});
  await page.goto("/");await fillRegistration(page);
  for(const background of ["#abc123","#cba321"]){const image=await sharp({create:{width:90,height:60,channels:3,background}}).png().toBuffer();await page.getByLabel("Selecionar foto do cliente").setInputFiles({name:"sintetica.png",mimeType:"image/png",buffer:image});await expect(page.getByRole("img",{name:"Pré-visualização do recorte"})).toBeVisible();}
  await page.getByRole("button",{name:"Remover seleção",exact:true}).click();await expect(page.getByRole("img",{name:"Pré-visualização do recorte"})).toHaveCount(0);
  await page.getByRole("button",{name:"Enviar cadastro",exact:true}).click();await expect(page.getByRole("status")).toContainText("Cadastro realizado");expect(received.image).toBeUndefined();expect(received.andamento_caso).toBe("");expect(photoRequests).toBe(0);
});

test("controles de recorte respondem ao toque sem trocar a imagem",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try {
    const page=await context.newPage();await page.goto("http://localhost:3198/");
    const image=await sharp({create:{width:180,height:120,channels:3,background:"#8899aa"}}).png().toBuffer();
    await page.getByLabel("Selecionar foto do cliente").setInputFiles({name:"sintetica.png",mimeType:"image/png",buffer:image});
    const preview=page.getByRole("img",{name:"Pré-visualização do recorte"});await expect(preview).toBeVisible();const src=await preview.getAttribute("src");
    for(const label of ["Aproximação","Posição horizontal","Posição vertical"]){const slider=page.getByRole("slider",{name:label,exact:true});await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();const before=await slider.inputValue();await page.touchscreen.tap(box.x+box.width*.8,box.y+box.height/2);expect(await slider.inputValue()).not.toBe(before);await expect(preview).toHaveAttribute("src",src);}
    await preview.scrollIntoViewIfNeeded();await expect(preview).toBeVisible();
  }finally{await context.close();}
});

test("badge acompanha classificação e andamento permite salvar, cancelar, limpar e reabrir",async({page})=>{
  await page.setViewportSize({width:390,height:900});
  const {state,image}=await adminFixture(page);await login(page);await page.getByRole("button",{name:"Visualizar Cliente Sintética"}).click();
  const drawer=page.getByRole("dialog",{name:"Cliente Sintética",exact:true});
  await expect(drawer.getByText("Nenhum andamento registrado",{exact:true})).toBeVisible();
  await drawer.getByRole("button",{name:"Adicionar classificação",exact:true}).click();await drawer.getByRole("radio",{name:"Judicial",exact:true}).check();page.once("dialog",d=>d.accept());await drawer.getByRole("button",{name:"Salvar informações",exact:true}).click();
  await expect(drawer.getByLabel("Classificação do caso")).toHaveText("Judicial");await expect(drawer.getByRole("heading",{name:"Tipo de caso jurídico",exact:true})).toBeVisible();
  for(const text of ["Andamento curto.","  Primeiro parágrafo.\n\n"+"Linha extensa. ".repeat(3000)+"\nFim.\n",""]){
    await drawer.getByRole("button",{name:"Editar andamento",exact:true}).click();const field=drawer.getByRole("textbox",{name:"Andamento do caso Opcional",exact:true});await expect(field).not.toHaveAttribute("maxlength");await field.fill(text);await drawer.getByRole("button",{name:"Salvar",exact:true}).click();await expect(drawer.getByRole("button",{name:"Editar andamento",exact:true})).toBeVisible();expect(state.client.andamento_caso).toBe(text||null);
    if(text)await expect.poll(async()=>await drawer.locator('[aria-labelledby="details-progress"] .case-text').textContent()===text).toBe(true);else await expect(drawer.getByText("Nenhum andamento registrado",{exact:true})).toBeVisible();
  }
  await drawer.getByRole("button",{name:"Editar andamento",exact:true}).click();await drawer.getByRole("textbox",{name:"Andamento do caso Opcional",exact:true}).fill("Não salvar");await drawer.getByRole("button",{name:"Cancelar",exact:true}).click();expect(state.client.andamento_caso).toBeNull();
  await drawer.getByLabel("Selecionar foto do cliente").setInputFiles({name:"sintetica.png",mimeType:"image/png",buffer:image});await assertStableCrop(page,drawer);await drawer.getByRole("button",{name:"Salvar foto",exact:true}).click();await expect(drawer.getByText("Foto adicionada com sucesso.",{exact:true})).toBeVisible();
  await drawer.getByRole("button",{name:"Fechar detalhes"}).click();await page.getByRole("button",{name:"Visualizar Cliente Sintética"}).click();await expect(drawer.getByLabel("Classificação do caso")).toHaveText("Judicial");await expect(drawer.getByText("Nenhum andamento registrado",{exact:true})).toBeVisible();
});
