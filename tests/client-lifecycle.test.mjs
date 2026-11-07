import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { asRole, featureDatabase } from "./database-fixture.mjs";

test("documentos opcionais, classificação, arquivo, fotos e exclusão protegida", async (t) => {
  const db = await featureDatabase();
  t.after(() => db.close());
  const user = randomUUID();
  const lawyer = randomUUID();
  const session = randomUUID();
  const viewerUser = randomUUID();
  const viewer = randomUUID();
  const viewerSession = randomUUID();
  const legacy = randomUUID();
  const hash = "a".repeat(64);
  await db.query("insert into auth.users(id) values ($1),($2)", [user, viewerUser]);
  await db.query("insert into auth.sessions(id,user_id) values ($1,$2),($3,$4)", [session,user,viewerSession,viewerUser]);
  await db.query(`insert into adv_advogados(id,auth_user_id,nome,email_login,oab_numero,oab_uf,ativo,permissao)
    values ($1,$2,'Gestão Sintética','gestao@example.test','123','SP',true,'gestao'),
           ($3,$4,'Consulta Sintética','consulta@example.test','124','SP',true,'consulta')`, [lawyer,user,viewer,viewerUser]);
  // Representa um documento legado criado quando existia somente a validação de formato.
  await db.exec("alter table adv_clientes disable trigger renata_validar_cliente");
  await db.query(`insert into adv_clientes(id,nome,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico)
    values ($1,'Cadastro anterior','Endereço antigo','RG-ANTIGO','11111111111','Filiação antiga','Brasileira','São Paulo','Caso jurídico anterior')`, [legacy]);
  await db.exec("alter table adv_clientes enable trigger renata_validar_cliente");
  const migration = await readFile(new URL("../supabase/migrations/20261107135415_clientes_documentos_fotos_arquivo.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const manager = (callback) => asRole(db,"authenticated",user,session,callback);
  const reader = (callback) => asRole(db,"authenticated",viewerUser,viewerSession,callback);
  const system = (callback) => asRole(db,"service_role",undefined,undefined,callback);
  const snapshot = (id) => db.query("select * from adv_clientes where id=$1", [id]).then(({ rows }) => rows[0]);
  const input = { nome:"Cliente de Teste", nome_social:"",endereco:"Endereço de teste",rg:"",cpf:"",filiacao:"Filiação de teste",
    nacionalidade:"Brasileira",cidade_nascimento:"São Paulo",caso_juridico:"Relato jurídico de teste",tipo_caso:"administrativo" };
  let id;

  await t.test("migração mantém dados antigos e exige tipo somente nos novos cadastros", async () => {
    const row = await snapshot(legacy);
    assert.equal(row.rg,"RG-ANTIGO");
    assert.equal(row.cpf,"11111111111");
    assert.equal(row.tipo_caso,null);
    assert.equal(row.foto_path,null);
    assert.equal(row.arquivado_em,null);
    await system(async () => {
      await assert.rejects(db.query("select adv_registrar_cliente($1,$2,$3)", [{...input,tipo_caso:null},randomUUID(),hash]), /tipo de caso/);
      await assert.rejects(db.query("select adv_registrar_cliente($1,$2,$3)", [{...input,tipo_caso:"outro"},randomUUID(),hash]), /check constraint/);
      await db.query("select adv_registrar_cliente($1,$2,$3)", [input,randomUUID(),hash]);
    });
    id = (await db.query("select id from adv_clientes where nome=$1", [input.nome])).rows[0].id;
    const created = await snapshot(id);
    assert.equal(created.rg,null);
    assert.equal(created.cpf,null);
  });

  await t.test("edição de documentos e tipo persiste e audita apenas nomes de campos", async () => {
    await manager(async () => {
      await assert.rejects(db.query("update adv_clientes set cpf='11111111111' where id=$1", [id]), /CPF inválido/);
      await db.query("update adv_clientes set cpf='52998224725',rg='RG-TESTE',tipo_caso='judicial' where id=$1", [id]);
      await db.query("update adv_clientes set cpf=null,rg=null where id=$1", [id]);
      const audit = (await db.query("select detalhes from adv_auditoria where cliente_id=$1", [id])).rows;
      assert.ok(audit.some(({detalhes}) => detalhes.campos?.includes("tipo_caso")));
      assert.doesNotMatch(JSON.stringify(audit), /52998224725|RG-TESTE/);
    });
  });

  await t.test("cada documento pode estar ausente independentemente e os dois tipos são aceitos", async () => {
    for (const [rg,cpf,tipo_caso] of [[null,null,"administrativo"],["RG-TESTE",null,"judicial"],[null,"52998224725","judicial"],["RG-TESTE","52998224725","administrativo"]]) {
      await db.exec("begin");
      try {
        const submission = randomUUID();
        await system(() => db.query("select adv_registrar_cliente($1,$2,$3)", [{...input,rg,cpf,tipo_caso},submission,hash]));
        const result = (await db.query("select rg,cpf,tipo_caso from adv_clientes where envio_id=$1", [submission])).rows[0];
        assert.deepEqual(result,{rg,cpf,tipo_caso});
      } finally {
        await db.exec("rollback");
      }
    }
    await manager(async () => {
      await db.query("update adv_clientes set nome='Cadastro anterior corrigido' where id=$1", [legacy]);
      await assert.rejects(db.query("update adv_clientes set tipo_caso=null where id=$1", [id]), /tipo de caso/);
    });
    assert.equal((await snapshot(legacy)).tipo_caso,null);
  });

  await t.test("foto prepara compensação antes do upload e associa somente com versão válida", async () => {
    const op = randomUUID();
    const row = await snapshot(id);
    await manager(async () => {
      const result = await db.query("select adv_foto_preparar($1,$2,$3,$4) as op", [id,row.versao,op,hash]);
      const path = result.rows[0].op.path;
      assert.match(path,/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
    });
    assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where cliente_id=$1", [id])).rows[0].n,1);
    await manager(async () => {
      await assert.rejects(db.query("select adv_foto_concluir($1)", [op]), /ainda não recebida/);
    });
    await db.query("insert into storage.objects(bucket_id,name) values ('fotos-clientes',$1)", [id+"/"+op+".webp"]);
    await manager(() => db.query("select adv_foto_concluir($1)", [op]));
    await manager(async () => {
      const repeat = await db.query("select adv_foto_preparar($1,$2,$3,$4) as op", [id,row.versao,op,hash]);
      assert.equal(repeat.rows[0].op.concluida,true);
    });
    assert.ok((await snapshot(id)).foto_path);
    assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where cliente_id=$1", [id])).rows[0].n,0);
  });

  await t.test("arquivar e restaurar preserva caso, documentos, foto e status", async () => {
    const before = await snapshot(id);
    await manager(() => db.query("select adv_cliente_arquivar($1,$2,true)", [id,before.versao]));
    const archived = await snapshot(id);
    assert.ok(archived.arquivado_em);
    assert.equal(archived.arquivado_por,lawyer);
    assert.equal(archived.foto_path,before.foto_path);
    assert.equal(archived.status,before.status);
    assert.equal(archived.caso_juridico,before.caso_juridico);
    await manager(async () => {
      assert.equal((await db.query("select id from adv_listar_clientes_v2('',null,null,null,false) where id=$1", [id])).rows.length,0);
      assert.equal((await db.query("select id from adv_listar_clientes_v2('',null,null,null,true) where id=$1", [id])).rows.length,1);
      const stats = (await db.query("select adv_totais_clientes_v2(true) as s")).rows[0].s;
      assert.equal(stats.arquivados,1);
      assert.equal(stats.ativos,1);
      await db.query("select adv_cliente_arquivar($1,$2,false)", [id,archived.versao]);
    });
    assert.equal((await snapshot(id)).foto_path,before.foto_path);
  });

  await t.test("Storage privado permite apenas a foto vinculada para sessões autorizadas", async () => {
    const path = (await snapshot(id)).foto_path;
    await db.query("insert into storage.objects(bucket_id,name) values ('fotos-clientes',$1)", [randomUUID()+"/"+randomUUID()+".webp"]);
    assert.equal((await db.query("select public from storage.buckets where id='fotos-clientes'")).rows[0].public,false);
    await asRole(db,"anon",undefined,undefined,async () => {
      assert.equal((await db.query("select * from storage.objects where bucket_id='fotos-clientes'")).rows.length,0);
    });
    await reader(async () => {
      const photos = (await db.query("select * from storage.objects where bucket_id='fotos-clientes'")).rows;
      assert.equal(photos.length,1);
      assert.equal(photos[0].name,path);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('fotos-clientes',$1)", [path]), /row-level security/);
    });
    await db.query("update adv_advogados set ativo=false where id=$1", [viewer]);
    await reader(async () => {
      assert.equal((await db.query("select * from storage.objects where bucket_id='fotos-clientes'")).rows.length,0);
    });
    await db.query("update adv_advogados set ativo=true where id=$1", [viewer]);
  });

  await t.test("consulta não arquiva, envia foto nem exclui, e gestão depende de liberação de retenção", async () => {
    const row = await snapshot(id);
    await reader(async () => {
      await assert.rejects(db.query("select adv_cliente_arquivar($1,$2,true)", [id,row.versao]), /Acesso não autorizado/);
      await assert.rejects(db.query("select adv_foto_preparar($1,$2,$3,$4)", [id,row.versao,randomUUID(),hash]), /Acesso não autorizado/);
      await assert.rejects(db.query("select adv_cliente_excluir($1,$2,$3)", [id,row.versao,randomUUID()]), /Acesso não autorizado/);
      await assert.rejects(db.query("select * from adv_storage_recolher(null)"), /permission denied/);
    });
    await manager(async () => {
      assert.equal((await db.query("select adv_cliente_pode_excluir($1) as ok", [id])).rows[0].ok,false);
      await assert.rejects(db.query("select adv_cliente_excluir($1,$2,$3)", [id,row.versao,randomUUID()]), /retenção/);
      await assert.rejects(db.query("select * from renata_privado.retencao_clientes"), /permission denied/);
    });
    assert.ok(await snapshot(id));
  });

  await t.test("substituição e remoção enfileiram os arquivos antigos e retomam falhas com leases", async () => {
    async function addPhoto() {
      const row = await snapshot(id);
      const op = randomUUID();
      await manager(() => db.query("select adv_foto_preparar($1,$2,$3,$4)", [id,row.versao,op,hash]));
      await db.query("insert into storage.objects(bucket_id,name) values ('fotos-clientes',$1)", [id+"/"+op+".webp"]);
      await manager(() => db.query("select adv_foto_concluir($1)", [op]));
    }
    const old = (await snapshot(id)).foto_path;
    await addPhoto();
    assert.notEqual((await snapshot(id)).foto_path,old);
    await system(async () => {
      const tasks = (await db.query("select * from adv_storage_recolher($1)", [id])).rows;
      assert.deepEqual(tasks.map(x=>x.foto_path),[old]);
      await db.query("delete from storage.objects where name=any($1)", [[old]]);
      await db.query("select adv_storage_concluir($1,$2)", [tasks.map(x=>x.id),tasks.map(x=>x.token)]);
    });
    const current = await snapshot(id);
    await manager(() => db.query("select adv_foto_remover($1,$2)", [id,current.versao]));
    assert.equal((await snapshot(id)).foto_path,null);
    await system(async () => {
      const tasks = (await db.query("select * from adv_storage_recolher($1)", [id])).rows;
      assert.equal(tasks.length,1);
      assert.equal((await db.query("select * from adv_storage_recolher($1)", [id])).rows.length,0);
      assert.equal((await db.query("select adv_storage_pendentes($1) as n", [id])).rows[0].n,1);
      // Falha de Storage: nenhum reconhecimento. Após expirar o lease, outro worker retoma.
      await db.query("update renata_privado.storage_limpezas set lease_ate=now()-interval '1 second' where id=$1", [tasks[0].id]);
      const retried = (await db.query("select * from adv_storage_recolher($1)", [id])).rows;
      assert.notEqual(retried[0].token,tasks[0].token);
      await db.query("select adv_storage_concluir($1,$2)", [tasks.map(x=>x.id),tasks.map(x=>x.token)]);
      assert.equal((await db.query("select concluida_em from renata_privado.storage_limpezas where id=$1", [tasks[0].id])).rows[0].concluida_em,null);
      await db.query("delete from storage.objects where name=any($1)", [retried.map(x=>x.foto_path)]);
      await db.query("select adv_storage_concluir($1,$2)", [retried.map(x=>x.id),retried.map(x=>x.token)]);
    });
    await addPhoto();
  });

  await t.test("exclusão espera limpeza de fotos e só então remove dados associados", async () => {
    const beforeApproval = await snapshot(id);
    await db.query("insert into renata_privado.retencao_clientes(cliente_id,versao,liberada_em,valida_ate,aprovado_por,referencia) values ($1,$3,now()-interval '2 hours',now()-interval '1 hour',$2,'AUTH-EXPIRADA')", [id,lawyer,beforeApproval.versao]);
    await manager(async () => {
      assert.equal((await db.query("select adv_cliente_pode_excluir($1) as ok", [id])).rows[0].ok,false);
      await assert.rejects(db.query("select adv_cliente_excluir($1,$2,$3)", [id,beforeApproval.versao,randomUUID()]), /retenção/);
    });
    const approval = await readFile(new URL("../supabase/liberar-exclusao.sql", import.meta.url), "utf8");
    async function approve(config) {
      try {
        await db.exec(approval.replace(/\$config\$[\s\S]*?\$config\$/, () => "$config$" + JSON.stringify(config) + "$config$"));
      } catch (error) {
        await db.exec("rollback");
        throw error;
      }
    }
    const decision = { cliente_id:id,aprovado_por:lawyer,referencia:"AUTH-TESTE",revisao_concluida:true };
    await assert.rejects(approve({...decision,revisao_concluida:null}), /revisão de retenção/);
    await approve(decision);
    await manager(async () => {
      assert.equal((await db.query("select adv_cliente_pode_excluir($1) as ok", [id])).rows[0].ok,true);
      await db.query("update adv_clientes set endereco='Endereço após a revisão' where id=$1", [id]);
      assert.equal((await db.query("select adv_cliente_pode_excluir($1) as ok", [id])).rows[0].ok,false);
    });
    await approve(decision);
    await manager(async () => {
      await db.query("insert into adv_observacoes(cliente_id,advogado_id,texto) values ($1,$2,'Informação posterior à revisão')", [id,lawyer]);
      assert.equal((await db.query("select adv_cliente_pode_excluir($1) as ok", [id])).rows[0].ok,false);
    });
    await approve(decision);
    const row = await snapshot(id);
    const unfinished = randomUUID();
    await manager(() => db.query("select adv_foto_preparar($1,$2,$3,$4)", [id,row.versao,unfinished,hash]));
    const orphanPath = id+"/"+unfinished+".webp";
    await db.query("insert into storage.objects(bucket_id,name) values ('fotos-clientes',$1)", [orphanPath]);
    const deletion = randomUUID();
    await manager(() => db.query("select adv_cliente_excluir($1,$2,$3)", [id,row.versao,deletion]));
    await manager(async () => {
      assert.equal((await db.query("select id from adv_clientes where id=$1", [id])).rows.length,0);
      assert.equal((await db.query("select adv_cliente_exclusao_estado($1) as estado", [deletion])).rows[0].estado,"pendente");
      await assert.rejects(db.query("select adv_foto_concluir($1)", [unfinished]), /Cadastro indisponível/);
      await assert.rejects(db.query("insert into adv_observacoes(cliente_id,advogado_id,texto) values ($1,$2,'Nota tardia')", [id,lawyer]), /Cadastro indisponível|row-level security/);
    });
    await system(async () => {
      assert.equal((await db.query("select adv_storage_finalizar_exclusoes($1) as n", [id])).rows[0].n,0);
      const tasks = (await db.query("select * from adv_storage_recolher($1)", [id])).rows;
      assert.equal(tasks.length,1);
      // Simula confirmação de remoção pela API Storage. Uma falha não confirmaria a tarefa.
      await db.query("delete from storage.objects where bucket_id='fotos-clientes' and name=any($1)", [tasks.map(x=>x.foto_path)]);
      await db.query("select adv_storage_concluir($1,$2)", [tasks.map(x=>x.id),tasks.map(x=>x.token)]);
      assert.equal((await db.query("select adv_storage_finalizar_exclusoes($1) as n", [id])).rows[0].n,0);
      await db.query("update renata_privado.storage_limpezas set disponivel_em=now()-interval '1 second' where foto_path=$1", [orphanPath]);
      const pending = (await db.query("select * from adv_storage_recolher($1)", [id])).rows;
      assert.equal(pending.length,1);
      await db.query("delete from storage.objects where name=$1", [orphanPath]);
      await db.query("select adv_storage_concluir($1,$2)", [pending.map(x=>x.id),pending.map(x=>x.token)]);
      assert.equal((await db.query("select adv_storage_finalizar_exclusoes($1) as n", [id])).rows[0].n,1);
      assert.equal((await db.query("select adv_storage_finalizar_exclusoes($1) as n", [id])).rows[0].n,0);
    });
    assert.equal(await snapshot(id),undefined);
    await manager(async () => {
      assert.equal((await db.query("select adv_cliente_exclusao_estado($1) as estado", [deletion])).rows[0].estado,"concluida");
      await db.query("select adv_cliente_excluir($1,$2,$3)", [id,row.versao,deletion]);
    });
    assert.equal((await db.query("select id from adv_observacoes where cliente_id=$1", [id])).rows.length,0);
    assert.equal((await db.query("select id from adv_auditoria where cliente_id=$1", [id])).rows.length,0);
    const log = (await db.query("select detalhes from adv_auditoria where acao='exclusao'")).rows;
    assert.equal(log.length,1);
    assert.deepEqual(log[0].detalhes,{operacao:deletion});
    assert.ok(await snapshot(legacy));
  });
});
