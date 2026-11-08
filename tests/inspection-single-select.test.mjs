import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { featureDatabase } from "./database-fixture.mjs";

test("inspeção unificada produz uma única saída e somente pendências, sem escrever",async t=>{
  const db=await featureDatabase();t.after(()=>db.close());
  await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql",import.meta.url),"utf8"));
  const sql=await readFile(new URL("../supabase/inspecionar-andamento-pendencias.sql",import.meta.url),"utf8");
  async function inspect(){
    await db.exec("begin transaction read only");
    try{
      assert.equal((await db.query("select current_setting('transaction_read_only') as value")).rows[0].value,"on");
      const results=await db.exec(sql);assert.equal(results.length,1);
      assert(results[0].rows.every(r=>r.ok===false));return results[0].rows;
    }finally{await db.exec("rollback");}
  }
  await t.test("configuração não acessível aparece como conferência manual pendente",async()=>{
    const rows=await inspect();assert.deepEqual(rows.map(r=>r.item),["schema_privado_na_data_api"]);assert.match(rows[0].detalhe,/conferência manual/);
  });
  await t.test("nenhuma divergência retorna zero linhas, sem tabela extra de sucesso",async()=>{
    await db.query("select set_config('pgrst.db_schemas','public,storage,graphql_public',false)");assert.deepEqual(await inspect(),[]);
  });
  await t.test("schema privado entre aspas é detectado",async()=>{
    await db.query("select set_config('pgrst.db_schemas','public, \"renata_privado\"',false)");assert.deepEqual((await inspect()).map(r=>r.item),["schema_privado_na_data_api"]);
    await db.query("select set_config('pgrst.db_schemas','public,storage,graphql_public',false)");
  });
  await t.test("falhas de RLS e bucket são reunidas no mesmo resultado",async()=>{
    await db.exec("alter table adv_clientes disable row level security; update storage.buckets set public=true where id='fotos-clientes'");
    const rows=await inspect();assert(rows.some(r=>r.item==="rls:public.adv_clientes"));assert(rows.some(r=>r.item==="bucket_privado"));
    await db.exec("alter table adv_clientes enable row level security; update storage.buckets set public=false where id='fotos-clientes'");
  });
  await t.test("coluna ausente gera pendência em vez de erro ou leitura de cadastros",async()=>{
    await db.exec("alter table adv_clientes rename column envio_hash to hash_temporario");
    assert((await inspect()).some(r=>r.item==="coluna:public.adv_clientes.envio_hash"));
    await db.exec("alter table adv_clientes rename column hash_temporario to envio_hash");
  });
  await t.test("atualização já existente aparece entre as pendências de pré-migração",async()=>{
    await db.exec(await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql",import.meta.url),"utf8"));
    const rows=await inspect();assert.equal(rows.filter(r=>r.item.startsWith("objeto_novo:")).length,4);
    assert.equal((await db.query("select count(*)::int as n from adv_clientes")).rows[0].n,0);
  });
});
