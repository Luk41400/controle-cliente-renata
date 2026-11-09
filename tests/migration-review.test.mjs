import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { featureDatabase, asRole } from "./database-fixture.mjs";

const migration=await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql",import.meta.url),"utf8");
async function database(){const db=await featureDatabase();await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql",import.meta.url),"utf8"));return db;}

test("revisão preventiva rejeita esquemas ou permissões incompatíveis sem alterações parciais",async t=>{
  const db=await database();t.after(()=>db.close());
  const originalPermission=(await db.query("select pg_get_functiondef('renata_privado.permissao_atual()'::regprocedure) as sql")).rows[0].sql;
  async function refuse(change,restore,expected){
    await db.exec(change);
    try { await assert.rejects(db.exec(migration),expected); }
    finally { await db.exec("rollback"); await db.exec(restore); }
    assert.equal((await db.query("select to_regclass('renata_privado.cadastro_fotos') as value")).rows[0].value,null);
    assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name='andamento_caso'")).rows[0].n,0);
  }
  await t.test("RLS desativado",()=>refuse("alter table adv_clientes disable row level security","alter table adv_clientes enable row level security",/rls:public.adv_clientes/));
  await t.test("política de leitura permissiva indevida",()=>refuse("alter policy renata_restringir_clientes_leitura on adv_clientes using(true)","alter policy renata_restringir_clientes_leitura on adv_clientes using((select renata_privado.permissao_atual()) is not null)",/politica:public.adv_clientes.renata_restringir_clientes_leitura/));
  await t.test("política de escrita sem gestão",()=>refuse("alter policy renata_restringir_clientes_edicao on adv_clientes using(true) with check(true)","alter policy renata_restringir_clientes_edicao on adv_clientes using((select renata_privado.permissao_atual())='gestao') with check((select renata_privado.permissao_atual())='gestao')",/politica:public.adv_clientes.renata_restringir_clientes_edicao/));
  await t.test("controle de sessão modificado",()=>refuse("create or replace function renata_privado.permissao_atual() returns text language sql stable security definer set search_path='' as $$ select 'gestao'::text $$",originalPermission,/funcao:renata_privado.permissao_atual/));
  await t.test("search_path de função privilegiada incompatível",()=>refuse("alter function renata_privado.permissao_atual() set search_path='public'","alter function renata_privado.permissao_atual() set search_path=''",/funcao:renata_privado.permissao_atual/));
  await t.test("permissão de execução necessária ao login/RLS ausente",()=>refuse("revoke execute on function renata_privado.permissao_atual() from authenticated","grant execute on function renata_privado.permissao_atual() to authenticated",/acl_funcao:renata_privado.permissao_atual/));
  await t.test("coluna de dependência ausente",()=>refuse("alter table adv_clientes rename column envio_hash to hash_temporario","alter table adv_clientes rename column hash_temporario to envio_hash",/coluna:public.adv_clientes.envio_hash/));
  await t.test("gatilho de auditoria desativado",()=>refuse("alter table adv_clientes disable trigger renata_auditar_cliente","alter table adv_clientes enable trigger renata_auditar_cliente",/gatilho:renata_auditar_cliente/));
  await t.test("bucket público",()=>refuse("update storage.buckets set public=true where id='fotos-clientes'","update storage.buckets set public=false where id='fotos-clientes'",/bucket_privado/));
  await t.test("usuário do navegador com acesso ao finalizador",()=>refuse("grant execute on function adv_storage_finalizar_exclusoes(uuid) to authenticated","revoke execute on function adv_storage_finalizar_exclusoes(uuid) from authenticated",/rpc_servico:public.adv_storage_finalizar_exclusoes/));
  await t.test("permissão do serviço insuficiente",()=>refuse("revoke delete on renata_privado.storage_limpezas from service_role","grant delete on renata_privado.storage_limpezas to service_role",/servico_privilegio:renata_privado.storage_limpezas/));
  await t.test("política de Storage incompatível",()=>refuse("alter policy renata_fotos_restricao_leitura on storage.objects using(true)","alter policy renata_fotos_restricao_leitura on storage.objects using(bucket_id<>'fotos-clientes' or renata_privado.pode_ler_foto(name))",/politica:storage.objects.renata_fotos_restricao_leitura/));
  await t.test("papel do navegador herdando service_role",()=>refuse("grant service_role to authenticated","revoke service_role from authenticated",/isolamento_papel:authenticated/));
  await t.test("consulta de inspeção é executável em transação somente leitura",async()=>{
    const result=await db.exec(await readFile(new URL("../supabase/inspecionar-andamento.sql",import.meta.url),"utf8"));
    const checks=result.find(r=>r.rows?.[0]?.item)?.rows;assert(checks.length>200);assert(checks.every(r=>r.ok));
    assert.equal((await db.query("select to_regclass('renata_privado.cadastro_fotos') as value")).rows[0].value,null);
  });
  await t.test("andamento existente com CHECK não é alterado silenciosamente",async()=>{
    await db.exec("alter table adv_clientes add column andamento_caso text check(length(andamento_caso)<=20)");
    await assert.rejects(db.exec(migration),/andamento_sem_restricao_preexistente/);await db.exec("rollback");
    assert.equal((await db.query("select count(*)::int as n from pg_constraint where conrelid='adv_clientes'::regclass and conname='adv_clientes_andamento_caso_check'")).rows[0].n,1);
    await db.exec("alter table adv_clientes drop column andamento_caso");
  });
});

test("verificação aceita finais de linha Windows e Unix sem ignorar alterações de lógica",async t=>{
  const db=await database();t.after(()=>db.close());
  const functions=(await db.query("select pg_get_functiondef(p.oid) as sql from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='renata_privado' or (n.nspname='public' and p.proname like 'adv_%')")).rows;
  for(const f of functions)await db.exec(f.sql.replaceAll("\r\n","\n"));
  await db.exec(migration);
  const results=await db.exec(await readFile(new URL("../supabase/conferir-andamento-aplicado.sql",import.meta.url),"utf8"));
  const rpcs=results.find(r=>r.rows?.[0]?.definicao_ok!==undefined)?.rows;assert.equal(rpcs.length,4);assert(rpcs.every(r=>r.definicao_ok&&r.service_execute&&!r.anon_execute&&!r.authenticated_execute));
});

test("aplicar a migração preserva os conteúdos e o finalizador mesmo com exclusão pendente",async t=>{
  const db=await database();t.after(()=>db.close());
  const id=randomUUID(),lawyer=randomUUID(),user=randomUUID(),operation=randomUUID();
  const path=id+'/'+randomUUID()+'.webp';
  await db.query("insert into auth.users(id) values($1)",[user]);
  await db.query("insert into adv_advogados(id,auth_user_id,nome,email_login,oab_numero,oab_uf,ativo,permissao) values($1,$2,'Gestão Sintética','gestao@example.test','123','SP',true,'gestao')",[lawyer,user]);
  await db.query("insert into adv_clientes(id,nome,endereco,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico,foto_path,exclusao_em) values($1,'Pessoa Sintética','Rua sintética','Filiação sintética','Brasileira','São Paulo','judicial','Texto a preservar',$2,now())",[id,path]);
  await db.query("insert into adv_auditoria(cliente_id,acao,detalhes) values($1,'evento_anterior','{}')",[id]);
  await db.query("insert into renata_privado.exclusoes(id,cliente_id,advogado_id,retencao_referencia) values($1,$2,$3,'Decisão sintética')",[operation,id,lawyer]);
  await db.query("insert into storage.objects(bucket_id,name) values('fotos-clientes',$1)",[path]);
  await db.query("insert into renata_privado.storage_limpezas(cliente_id,foto_path) values($1,$2)",[id,path]);
  const snapshot=()=>db.query(`select jsonb_build_object(
    'clients',(select jsonb_agg(to_jsonb(c)-'andamento_caso') from adv_clientes c),
    'lawyers',(select jsonb_agg(to_jsonb(a)) from adv_advogados a),
    'notes',(select jsonb_agg(to_jsonb(o)) from adv_observacoes o),
    'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from adv_auditoria a),
    'files',(select jsonb_agg(to_jsonb(o)) from storage.objects o),
    'queue',(select jsonb_agg(to_jsonb(l)) from renata_privado.storage_limpezas l),
    'deletions',(select jsonb_agg(to_jsonb(e)) from renata_privado.exclusoes e)) as data`).then(r=>r.rows[0].data);
  const finalizer=()=>db.query("select pg_get_functiondef(oid) as definition,proowner,proacl::text as acl from pg_proc where oid='public.adv_storage_finalizar_exclusoes(uuid)'::regprocedure").then(r=>r.rows[0]);
  const before=await snapshot(),oldFunction=await finalizer();
  await db.exec(migration);assert.deepEqual(await snapshot(),before);assert.deepEqual(await finalizer(),oldFunction);
  await assert.rejects(db.exec(migration),/já existe total ou parcialmente/);await db.exec("rollback");assert.deepEqual(await snapshot(),before);
  for(const role of ["anon","authenticated"])await asRole(db,role,user,undefined,()=>assert.rejects(db.query("select adv_cadastro_fotos_limpar()"),/permission denied/));
  // Limpeza de reservas (sem autorização para clientes) não executa o finalizador.
  await asRole(db,"service_role",undefined,undefined,()=>db.query("select adv_cadastro_fotos_limpar()"));assert.deepEqual(await snapshot(),before);
});
