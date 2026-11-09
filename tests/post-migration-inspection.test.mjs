import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { featureDatabase } from "./database-fixture.mjs";

const sql = await readFile(new URL("../supabase/conferir-andamento-pendencias.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql", import.meta.url), "utf8");
async function inspect(db) {
  await db.exec("begin transaction read only");
  try {
    const results = await db.exec(sql);
    assert.equal(results.length, 1);
    assert(results[0].rows.every(row => row.ok === false));
    assert.deepEqual(results[0].fields.map(f => f.name), ["item", "ok", "detalhe"]);
    return results[0].rows;
  } finally { await db.exec("rollback"); }
}

test("inspeção pós-migração retorna apenas pendências, em um SELECT somente leitura", async t => {
  const db = await featureDatabase({publicFunctionDefaults:true});
  t.after(() => db.close());
  await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql", import.meta.url), "utf8"));
  await t.test("objetos novos ausentes viram pendências, sem executar migração", async () => {
    const rows = await inspect(db);
    assert(rows.some(r => r.item === "coluna:public.adv_clientes.andamento_caso"));
    assert(rows.some(r => r.item === "funcao:public.adv_cadastro_fotos_limpar()"));
  });
  await db.exec(migration);
  await t.test("estado compatível retorna zero linhas; Data API usa confirmação manual explícita", async () => {
    assert.deepEqual(await inspect(db), []);
  });
  async function changeAndRestore(change, expected) {
    await db.exec("begin");
    try {
      await db.exec(change);
      const results = await db.exec(sql);
      assert.equal(results.length, 1);
      assert(results[0].rows.some(r => r.item === expected && r.ok === false), JSON.stringify(results[0].rows));
    } finally { await db.exec("rollback"); }
  }
  await t.test("andamento ausente e CHECK de comprimento são detectados", async () => {
    await changeAndRestore("alter table public.adv_clientes rename column andamento_caso to andamento_temporario", "coluna:public.adv_clientes.andamento_caso");
    await changeAndRestore("alter table public.adv_clientes add constraint andamento_limitado check(length(andamento_caso)<100)", "andamento_sem_limite_check");
  });
  await t.test("ACL de coluna e RPC privilegiada são conferidas", async () => {
    await changeAndRestore("revoke update(andamento_caso) on public.adv_clientes from authenticated", "andamento_privilegio:authenticated:UPDATE");
    await changeAndRestore("grant execute on function public.adv_registrar_cliente_com_foto(jsonb,uuid,text) to public", "acl_funcao:public.adv_registrar_cliente_com_foto(jsonb, uuid, text)");
  });
  await t.test("reservas sem RLS ou com grant herdado são detectadas", async () => {
    await changeAndRestore("alter table renata_privado.cadastro_fotos disable row level security", "rls:renata_privado.cadastro_fotos");
    await changeAndRestore("create role leitor_reservas; grant select on renata_privado.cadastro_fotos to leitor_reservas; grant leitor_reservas to authenticated", "privado_sem_authenticated:renata_privado.cadastro_fotos");
  });
  await t.test("não aceita política RLS enfraquecida e aceita qualificação legítima", async () => {
    await changeAndRestore("alter policy renata_restringir_clientes_edicao on public.adv_clientes using(true) with check(true)", "politica:public.adv_clientes.renata_restringir_clientes_edicao");
    await db.exec("set search_path=pg_catalog");
    assert.deepEqual(await inspect(db), []);
    await db.exec("set search_path=public,pg_catalog");
  });
  await t.test("FK incorreta, CHECK ausente e índice ausente são detectados", async () => {
    await changeAndRestore("alter table renata_privado.cadastro_fotos drop constraint cadastro_fotos_cliente_vinculado_fkey; alter table renata_privado.cadastro_fotos add foreign key(cliente_vinculado) references public.adv_clientes(id)", "cadastro_fotos_fk_cliente");
    await changeAndRestore("alter table renata_privado.cadastro_fotos drop constraint cadastro_fotos_check", "cadastro_fotos_check:cadastro_fotos_check");
    await changeAndRestore("drop index renata_privado.renata_cadastro_fotos_vinculo", "cadastro_fotos_indice:renata_cadastro_fotos_vinculo");
  });
  await t.test("código do finalizador e seu acesso exclusivo continuam verificados sem chamá-lo", async () => {
    await changeAndRestore("create or replace function public.adv_storage_finalizar_exclusoes(p_cliente uuid default null) returns integer language plpgsql security invoker set search_path='' as $$ begin return 0; end $$", "funcao:public.adv_storage_finalizar_exclusoes(uuid)");
    await changeAndRestore("grant execute on function public.adv_storage_finalizar_exclusoes(uuid) to authenticated", "acl_funcao:public.adv_storage_finalizar_exclusoes(uuid)");
  });
  await t.test("exposição privada explícita continua pendente apesar da confirmação anterior", async () => {
    await changeAndRestore("select set_config('pgrst.db_schemas','public,\"renata_privado\"',true)", "schema_privado_na_data_api");
  });
  await t.test("bucket público e RPC nova removida são detectados", async () => {
    await changeAndRestore("update storage.buckets set public=true where id='fotos-clientes'", "bucket_privado");
    await changeAndRestore("drop function public.adv_cadastro_fotos_limpar()", "funcao:public.adv_cadastro_fotos_limpar()");
  });
  await t.test("inspeção não cria cadastros, fotos nem reservas", async () => {
    assert.deepEqual(await inspect(db), []);
    for (const table of ["public.adv_clientes", "storage.objects", "renata_privado.cadastro_fotos"])
      assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0);
  });
});
