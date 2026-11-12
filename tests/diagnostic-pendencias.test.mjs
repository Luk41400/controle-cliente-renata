import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { featureDatabase } from "./database-fixture.mjs";

const diagnostic=await readFile(new URL("../supabase/diagnosticar-15-pendencias.sql",import.meta.url),"utf8");
const inspection=await readFile(new URL("../supabase/inspecionar-andamento-pendencias.sql",import.meta.url),"utf8");
const migration=await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql",import.meta.url),"utf8");
async function database(options){const db=await featureDatabase(options);await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql",import.meta.url),"utf8"));await db.query("select set_config('pgrst.db_schemas','public,storage,graphql_public',false)");return db;}
async function readonly(db,sql){await db.exec("begin transaction read only");try{const result=await db.exec(sql);assert.equal(result.length,1);return result[0].rows;}finally{await db.exec("rollback");}}

test("diagnóstico distingue ACL efetiva, PUBLIC, herança e diferenças de RLS sem executar a aplicação",async t=>{
  const db=await database();t.after(()=>db.close());
  await t.test("uma tabela de 15 comparações, com valores reais e esperados",async()=>{
    const rows=await readonly(db,diagnostic);assert.equal(rows.length,15);assert.equal(rows.filter(r=>r.categoria==="ACL_FUNCAO").length,11);assert.equal(rows.filter(r=>r.categoria==="POLITICA_RLS").length,3);
    assert(rows.filter(r=>r.categoria==="ACL_FUNCAO").every(r=>r.avaliacao==="COINCIDE_COM_ESPERADO_ANTERIOR"));
    assert(rows.filter(r=>r.categoria==="POLITICA_RLS").every(r=>r.encontrado.estrutura_e_dependencias_ok&&["COINCIDE_COM_ESPERADO_ANTERIOR","POSSIVEL_FALSO_POSITIVO_REPRESENTACAO"].includes(r.avaliacao)));
    const sample=rows[0].encontrado;assert(sample.definicao.includes("CREATE OR REPLACE FUNCTION"));assert.equal(sample.execute_efetivo.service_role,false);assert.equal(sample.origens_por_papel.service_role.bypassrls_nao_substitui_execute,true);
  });
  await t.test("identifica EXECUTE herdado sem confundi-lo com grant direto",async()=>{
    await db.exec("create role executor_backend; grant executor_backend to service_role; grant execute on function public.adv_totais_clientes() to executor_backend");
    const row=(await readonly(db,diagnostic)).find(r=>r.item==="public.adv_totais_clientes()");assert.equal(row.avaliacao,"POSSIVEL_FALSO_POSITIVO_SERVICE_ROLE");const origin=row.encontrado.origens_por_papel.service_role;
    assert.equal(origin.grant_acl_direto_ou_default,false);assert(origin.papeis_herdados_com_execute.some(r=>r.papel==="executor_backend"));assert(!(await readonly(db,inspection)).some(r=>r.item==="acl_funcao:public.adv_totais_clientes()"));
    await db.exec("revoke executor_backend from service_role");
  });
  await t.test("acesso de PUBLIC continua sendo bloqueio real",async()=>{
    await db.exec("grant execute on function public.adv_totais_clientes() to public");const row=(await readonly(db,diagnostic)).find(r=>r.item==="public.adv_totais_clientes()");assert.equal(row.avaliacao,"DIVERGENCIA_RELEVANTE");assert.equal(row.encontrado.origens_por_papel.anon.grant_via_public,true);assert((await readonly(db,inspection)).some(r=>r.item==="acl_funcao:public.adv_totais_clientes()"));await db.exec("revoke execute on function public.adv_totais_clientes() from public");
  });
  await t.test("herdar service_role no navegador nunca é classificado como inofensivo",async()=>{
    await db.exec("grant service_role to authenticated");assert((await readonly(db,diagnostic)).filter(r=>r.categoria==="ACL_FUNCAO").every(r=>r.avaliacao==="DIVERGENCIA_RELEVANTE"));assert((await readonly(db,inspection)).some(r=>r.item==="isolamento_papel:authenticated"));await db.exec("revoke service_role from authenticated");
  });
  await t.test("qualificação public. não exige alterar as três políticas",async()=>{
    await db.exec("set search_path=pg_catalog");const rows=await readonly(db,diagnostic);assert(rows.filter(r=>r.categoria==="POLITICA_RLS").every(r=>r.avaliacao==="POSSIVEL_FALSO_POSITIVO_REPRESENTACAO"));assert.deepEqual(await readonly(db,inspection),[]);await db.exec("set search_path=public,pg_catalog");
  });
  await t.test("OR true permanece uma divergência, não uma diferença de formatação",async()=>{
    await db.exec("alter policy renata_observacao_cliente_visivel on public.adv_observacoes using(exists(select 1 from public.adv_clientes c where c.id=cliente_id) or true)");const row=(await readonly(db,diagnostic)).find(r=>r.item.endsWith(".renata_observacao_cliente_visivel"));assert.equal(row.avaliacao,"DEFINICAO_DIFERENTE_REVISAR");assert((await readonly(db,inspection)).some(r=>r.item==="politica:public.adv_observacoes.renata_observacao_cliente_visivel"));await db.exec("alter policy renata_observacao_cliente_visivel on public.adv_observacoes using(exists(select 1 from public.adv_clientes c where c.id=cliente_id))");
  });
  await t.test("tabela homônima de outro schema não passa nem com texto idêntico",async()=>{
    await db.exec("create schema sombra; create table sombra.adv_clientes(id uuid); alter policy renata_observacao_cliente_visivel on public.adv_observacoes using(exists(select 1 from sombra.adv_clientes c where c.id=cliente_id)); set search_path=sombra,public,pg_catalog");const row=(await readonly(db,diagnostic)).find(r=>r.item.endsWith(".renata_observacao_cliente_visivel"));assert.equal(row.avaliacao,"ESTRUTURA_OU_DEPENDENCIA_DIFERENTE");assert(row.encontrado.outras_tabelas_referenciadas.includes("sombra.adv_clientes"));assert((await readonly(db,inspection)).some(r=>r.item==="politica:public.adv_observacoes.renata_observacao_cliente_visivel"));await db.exec("set search_path=public,pg_catalog; alter policy renata_observacao_cliente_visivel on public.adv_observacoes using(exists(select 1 from public.adv_clientes c where c.id=cliente_id))");
  });
  await t.test("consulta não cria objetos ou dados",async()=>{assert.equal((await db.query("select count(*)::int as n from public.adv_clientes")).rows[0].n,0);assert.equal((await db.query("select to_regclass('renata_privado.cadastro_fotos') as value")).rows[0].value,null);});
});

test("defaults Supabase de EXECUTE para service_role não causam onze falsos bloqueios",async t=>{
  const db=await database({publicFunctionDefaults:true});t.after(()=>db.close());
  await db.exec("set search_path=pg_catalog");const rows=await readonly(db,diagnostic);const acl=rows.filter(r=>r.categoria==="ACL_FUNCAO");assert.equal(acl.length,11);assert(acl.every(r=>r.avaliacao==="POSSIVEL_FALSO_POSITIVO_SERVICE_ROLE"));assert(acl.every(r=>r.encontrado.execute_efetivo.service_role&&!r.encontrado.execute_efetivo.anon&&r.encontrado.execute_efetivo.authenticated));assert(acl.every(r=>r.encontrado.defaults_atuais_nao_provam_origem_historica.some(d=>d.grantee==="service_role"&&d.privilegio==="EXECUTE")));
  assert.deepEqual(await readonly(db,inspection),[]);
  await db.exec(migration);assert.equal((await db.query("select count(*)::int as n from public.adv_clientes")).rows[0].n,0);
});
