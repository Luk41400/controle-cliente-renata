import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { asRole, featureDatabase } from "./database-fixture.mjs";
import { cropGeometry } from "../src/lib/photo-crop.ts";

test("geometria da prévia e do arquivo usa o mesmo recorte, inclusive nos extremos", () => {
  for (const [width,height] of [[1200,800],[800,1200],[800,800]]) for (const zoom of [1,1.5,3]) for (const x of [0,50,100]) for (const y of [0,50,100]) {
    const g = cropGeometry(width,height,{zoom,x,y});
    assert(g.x >= 0 && g.y >= 0 && g.x + g.side <= width + 1e-8 && g.y + g.side <= height + 1e-8);
    const previewOffsetX = -g.x / width * zoom * (width / Math.min(width,height) * 240);
    assert(Math.abs(previewOffsetX - -g.x / g.side * 240) < 1e-8);
  }
});

test("andamento e fotografia inicial em PostgreSQL descartável", async (t) => {
  const db = await featureDatabase();t.after(()=>db.close());
  await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql",import.meta.url),"utf8"));
  const legacy=randomUUID(),user=randomUUID(),lawyer=randomUUID(),session=randomUUID(),viewer=randomUUID(),viewerLawyer=randomUUID(),viewerSession=randomUUID();
  await db.query("insert into auth.users(id) values($1),($2)",[user,viewer]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4)",[session,user,viewerSession,viewer]);
  await db.query("insert into adv_advogados(id,auth_user_id,nome,email_login,oab_numero,oab_uf,ativo,permissao) values($1,$2,'Gestão Sintética','gestao@example.test','123','SP',true,'gestao'),($3,$4,'Consulta Sintética','consulta@example.test','124','SP',true,'consulta')",[lawyer,user,viewerLawyer,viewer]);
  const data={nome:"Pessoa Sintética",endereco:"Rua de teste",rg:null,cpf:null,filiacao:"Filiação sintética",nacionalidade:"Brasileira",cidade_nascimento:"São Paulo",tipo_caso:"judicial",caso_juridico:"Caso sintético extenso",andamento_caso:"Primeiro parágrafo.\n\nSegundo parágrafo.\n"};
  await db.query("insert into adv_clientes(id,nome,endereco,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico) values($1,$2,$3,$4,$5,$6,$7,$8)",[legacy,data.nome,data.endereco,data.filiacao,data.nacionalidade,data.cidade_nascimento,data.tipo_caso,data.caso_juridico]);
  const migration=await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql",import.meta.url),"utf8");
  await db.exec(migration);
  const system=fn=>asRole(db,"service_role",undefined,undefined,fn);
  const manager=fn=>asRole(db,"authenticated",user,session,fn);
  let photoClient;

  await t.test("legados preservados, andamento extenso e auditoria sem conteúdo",async()=>{
    assert.equal((await db.query("select andamento_caso from adv_clientes where id=$1",[legacy])).rows[0].andamento_caso,null);
    const long="  Início.\n\n"+"Atualização do caso. ".repeat(20000)+"\nFim.\n";
    await manager(async()=>{
      await db.query("update adv_clientes set andamento_caso=$1 where id=$2",[long,legacy]);
      await db.query("update adv_clientes set status='em_andamento',rg='RG-TESTE' where id=$1",[legacy]);
      assert.equal((await db.query("select andamento_caso from adv_clientes where id=$1",[legacy])).rows[0].andamento_caso,long);
      const audit=(await db.query("select detalhes from adv_auditoria where cliente_id=$1",[legacy])).rows;
      assert(audit.some(r=>r.detalhes.campos?.includes("andamento_caso")));assert(!JSON.stringify(audit).includes("Atualização do caso."));
      await db.query("update adv_clientes set andamento_caso=null where id=$1",[legacy]);
    });
    await asRole(db,"authenticated",viewer,viewerSession,async()=>assert.equal((await db.query("update adv_clientes set andamento_caso='Não permitido' where id=$1 returning id",[legacy])).rows.length,0));
    await asRole(db,"anon",undefined,undefined,async()=>{await assert.rejects(db.query("select andamento_caso from adv_clientes"),/permission denied/);});
  });
  await t.test("cadastro sem foto salva andamento e permite vazio",async()=>{
    for(const andamento of [null,"",data.andamento_caso])await system(async()=>{
      const envio=randomUUID();await db.query("select adv_registrar_cliente($1,$2,$3)",[{...data,andamento_caso:andamento},envio,"a".repeat(64)]);
      const row=(await db.query("select andamento_caso,foto_path from adv_clientes where envio_id=$1",[envio])).rows[0];assert.equal(row.andamento_caso,andamento||null);assert.equal(row.foto_path,null);
    });
  });
  await t.test("foto inicial reserva compensação antes do upload e cadastro é idempotente",async()=>{
    await system(async()=>{
      const envio=randomUUID(),hash="b".repeat(64);const op=(await db.query("select adv_cadastro_foto_preparar($1,$2) as op",[envio,hash])).rows[0].op;
      assert.equal(op.concluida,false);assert.match(op.path,/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
      assert.equal((await db.query("select cliente_id from renata_privado.storage_limpezas where foto_path=$1",[op.path])).rows[0].cliente_id,null);
      await assert.rejects(db.query("select adv_registrar_cliente_com_foto($1,$2,$3)",[data,envio,hash]),/Fotografia não recebida/);
      await assert.rejects(db.query("select adv_cadastro_foto_preparar($1,$2)",[envio,"c".repeat(64)]),/Envio alterado/);
      await db.query("insert into storage.objects(bucket_id,name) values('fotos-clientes',$1)",[op.path]);
      for(let i=0;i<2;i++)assert.equal((await db.query("select adv_registrar_cliente_com_foto($1,$2,$3) as ok",[data,envio,hash])).rows[0].ok,true);
      const rows=(await db.query("select andamento_caso,foto_path from adv_clientes where envio_id=$1",[envio])).rows;assert.equal(rows.length,1);assert.equal(rows[0].foto_path,op.path);assert.equal(rows[0].andamento_caso,data.andamento_caso);
      photoClient=op.path.split("/")[0];
      assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where foto_path=$1",[op.path])).rows[0].n,0);
      assert.equal((await db.query("select adv_cadastro_foto_preparar($1,$2) as op",[envio,hash])).rows[0].op.concluida,true);
    });
  });
  await t.test("falha de cadastro mantém compensação e arquivo expirado é recuperável",async()=>{
    await system(async()=>{
      const envio=randomUUID(),hash="d".repeat(64);const op=(await db.query("select adv_cadastro_foto_preparar($1,$2) as op",[envio,hash])).rows[0].op;
      await db.query("insert into storage.objects(bucket_id,name) values('fotos-clientes',$1)",[op.path]);
      await assert.rejects(db.query("select adv_registrar_cliente_com_foto($1,$2,$3)",[{...data,nome:""},envio,hash]),/check constraint/);
      await db.query("update renata_privado.cadastro_fotos set expira_em=now()-interval '1 minute' where envio_id=$1",[envio]);
      await db.query("update renata_privado.storage_limpezas set disponivel_em=now()-interval '1 minute' where foto_path=$1",[op.path]);
      await assert.rejects(db.query("select adv_registrar_cliente_com_foto($1,$2,$3)",[data,envio,hash]),/Envio expirado/);
      const task=(await db.query("select * from adv_storage_recolher(null)")).rows.find(r=>r.foto_path===op.path);assert(task);
      // Simula somente a confirmação da API Storage. Nenhum arquivo de produção é acessado.
      await db.query("delete from storage.objects where name=$1",[op.path]);await db.query("select adv_storage_concluir($1,$2)",[[task.id],[task.token]]);
      assert.equal((await db.query("select count(*)::int as n from adv_clientes where envio_id=$1",[envio])).rows[0].n,0);
    });
  });
  await t.test("navegador não acessa operações privadas nem RPCs de foto inicial",async()=>{
    for(const role of ["anon","authenticated"])await asRole(db,role,user,session,async()=>{
      await assert.rejects(db.query("select * from renata_privado.cadastro_fotos"),/permission denied/);
      await assert.rejects(db.query("select adv_cadastro_foto_preparar($1,$2)",[randomUUID(),"e".repeat(64)]),/permission denied/);
      await assert.rejects(db.query("select adv_registrar_cliente_com_foto($1,$2,$3)",[data,randomUUID(),"e".repeat(64)]),/permission denied/);
    });
    assert.equal((await db.query("select public from storage.buckets where id='fotos-clientes'")).rows[0].public,false);
  });
  await t.test("exclusão com revisão individual remove também metadados da foto inicial",async()=>{
    const operation=randomUUID();
    const version=(await db.query("select versao from adv_clientes where id=$1",[photoClient])).rows[0].versao;
    await db.query("insert into renata_privado.retencao_clientes(cliente_id,versao,liberada_em,valida_ate,aprovado_por,referencia) values($1,$2,now(),now()+interval '1 hour',$3,'Decisão sintética')",[photoClient,version,lawyer]);
    await manager(()=>db.query("select adv_cliente_excluir($1,$2,$3)",[photoClient,version,operation]));
    await system(async()=>{
      const tasks=(await db.query("select * from adv_storage_recolher($1)",[photoClient])).rows;assert.equal(tasks.length,1);
      await db.query("delete from storage.objects where name=$1",[tasks[0].foto_path]);
      await db.query("select adv_storage_concluir($1,$2)",[tasks.map(t=>t.id),tasks.map(t=>t.token)]);
      await db.query("select adv_storage_finalizar_exclusoes($1)",[photoClient]);
    });
    assert.equal((await db.query("select count(*)::int as n from renata_privado.cadastro_fotos where cliente_id=$1",[photoClient])).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from adv_clientes where id=$1",[legacy])).rows[0].n,1);
  });
});

test("migração reutiliza a coluna TEXT existente e interrompe ao encontrar possível coluna equivalente",async t=>{
  for(const name of ["andamento_caso","andamento"]){
    const db=await featureDatabase();t.after(()=>db.close());
    await db.exec(await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql",import.meta.url),"utf8"));
    await db.exec(`alter table adv_clientes add column ${name} text`);
    const id=randomUUID();await db.query(`insert into adv_clientes(id,nome,endereco,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico,${name}) values($1,'Cliente anterior','Endereço sintético','Filiação sintética','Brasileira','São Paulo','judicial','Relato sintético','Conteúdo preservado')`,[id]);
    const sql=await readFile(new URL("../supabase/migrations/20261108183508_andamento_foto_cadastro.sql",import.meta.url),"utf8");
    if(name==="andamento_caso")await db.exec(sql);else{await assert.rejects(db.exec(sql),/possível coluna de andamento/);await db.exec("rollback");}
    assert.equal((await db.query(`select ${name} as texto from adv_clientes where id=$1`,[id])).rows[0].texto,"Conteúdo preservado");
  }
});
