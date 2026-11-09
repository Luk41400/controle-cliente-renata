import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { featureDatabase, asRole } from "../database-fixture.mjs";

// Requer npm run build. Exercita a rota Next e o SDK reais contra HTTP/Storage
// sintéticos e PostgreSQL descartável; não carrega credenciais ou dados reais.
test("API real de cadastro com foto e andamento contra Supabase HTTP sintético",async t=>{
  const db=await featureDatabase();t.after(()=>db.close());
  for(const name of ["20261107135415_clientes_documentos_fotos_arquivo.sql","20261108183508_andamento_foto_cadastro.sql"])await db.exec(await readFile(new URL("../../supabase/migrations/"+name,import.meta.url),"utf8"));
  const blobs=new Map();let failCommit=false;let uploadCalls=0;
  const rpc={adv_limitar_tentativas:["p_chave","p_janela_segundos","p_maximo"],adv_cadastro_foto_preparar:["p_envio","p_hash"],adv_registrar_cliente:["p_dados","p_envio","p_hash"],adv_registrar_cliente_com_foto:["p_dados","p_envio","p_hash"],adv_storage_recolher:["p_cliente"],adv_storage_concluir:["p_ids","p_tokens"],adv_storage_finalizar_exclusoes:["p_cliente"],adv_storage_pendentes:["p_cliente"],adv_cadastro_fotos_limpar:[]};
  const backend=http.createServer(async(req,res)=>{
    const respond=(status,data)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(data));};
    try{
      assert.equal(req.headers.apikey,"synthetic-service-key");
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const buffer=Buffer.concat(chunks);
      const fn=req.url.replace("/rest/v1/rpc/","");
      if(req.method==="POST"&&Object.hasOwn(rpc,fn)){
        if(failCommit&&fn==="adv_registrar_cliente_com_foto"){failCommit=false;return respond(503,{message:"Falha sintética de rede."});}
        const data=JSON.parse(buffer.toString());const keys=rpc[fn];
        const table=fn==="adv_storage_recolher";
        const result=await asRole(db,"service_role",undefined,undefined,()=>db.query(`${table?"select * from":"select"} public.${fn}(${keys.map((_,i)=>"$"+(i+1)).join(",")})${table?"":" as result"}`,keys.map(k=>data[k])));
        return respond(200,table?result.rows:result.rows[0].result);
      }
      if(req.method==="DELETE"&&req.url==="/storage/v1/object/fotos-clientes"){
        const {prefixes}=JSON.parse(buffer.toString());for(const key of prefixes){blobs.delete(key);await asRole(db,"service_role",undefined,undefined,()=>db.query("delete from storage.objects where bucket_id='fotos-clientes' and name=$1",[key]));}
        return respond(200,prefixes.map(name=>({name})));
      }
      const prefix="/storage/v1/object/fotos-clientes/";
      if(req.method==="POST"&&req.url.startsWith(prefix)){
        uploadCalls++;const key=decodeURIComponent(req.url.slice(prefix.length));
        if(blobs.has(key))return respond(409,{error:"Duplicate",message:"Object already exists",statusCode:409});
        const meta=await sharp(buffer).metadata();assert.equal(meta.format,"webp");assert.deepEqual([meta.width,meta.height],[768,768]);assert.equal(meta.exif,undefined);
        const inserted=await asRole(db,"service_role",undefined,undefined,()=>db.query("insert into storage.objects(bucket_id,name) values('fotos-clientes',$1) on conflict(bucket_id,name) do nothing returning id",[key]));
        if(!inserted.rows.length)return respond(409,{error:"Duplicate",message:"Object already exists",statusCode:409});
        blobs.set(key,buffer);
        return respond(200,{Key:"fotos-clientes/"+key,Id:randomUUID()});
      }
      respond(404,{message:"Rota de teste ausente."});
    }catch(error){respond(400,{code:error.code||"TEST_ERROR",message:"Erro no ambiente sintético."});}
  });
  await new Promise(resolve=>backend.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>backend.close(resolve)));
  const origin="http://localhost:3197";
  const cronSecret="synthetic-cron-secret-used-only-in-disposable-tests-123456789";
  const app=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","localhost","--port","3197"],{windowsHide:true,stdio:"ignore",env:{...process.env,VERCEL:"",APP_ORIGIN:origin,SUPABASE_URL:`http://127.0.0.1:${backend.address().port}`,SUPABASE_SECRET_KEY:"synthetic-service-key",SUPABASE_PUBLISHABLE_KEY:"synthetic-public-key",APP_HASH_SECRET:"synthetic-secret-used-only-in-disposable-tests-123456789",CRON_SECRET:cronSecret}});
  t.after(()=>app.kill());
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(origin)).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert(ready,"Servidor local não iniciou.");
  const post=body=>fetch(origin+"/api/cadastro",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const input={nome:"Pessoa Sintética",endereco:"Rua sintética",rg:"",cpf:"",nome_social:"",filiacao:"Filiação sintética",nacionalidade:"Brasileira",cidade_nascimento:"São Paulo",tipo_caso:"administrativo",caso_juridico:"Relato jurídico sintético.",andamento_caso:""};
  await t.test("sem foto, texto extenso e parágrafos persistem sem truncamento",async()=>{
    for(const text of ["","Curto.","  Primeiro.\n\n"+"Atualização. ".repeat(30000)+"\nÚltimo.\n"]){const envio=randomUUID();const r=await post({...input,envio,andamento_caso:text});assert.equal(r.status,201);const row=(await db.query("select foto_path,andamento_caso from adv_clientes where envio_id=$1",[envio])).rows[0];assert.equal(row.andamento_caso,text||null);assert.equal(row.foto_path,null);assert.equal(blobs.size,0);}
  });
  await t.test("upload e cadastro sobrevivem à perda da resposta sem duplicar cliente ou foto",async()=>{
    const image=(await sharp({create:{width:100,height:80,channels:3,background:"#acbdce"}}).png().toBuffer()).toString("base64");const envio=randomUUID();const data={...input,envio,image,andamento_caso:"Andamento com foto.\n\nOutro parágrafo."};
    failCommit=true;assert.equal((await post(data)).status,503);assert.equal(blobs.size,1);assert.equal((await db.query("select count(*)::int as n from adv_clientes where envio_id=$1",[envio])).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where concluida_em is null")).rows[0].n,1);
    for(let i=0;i<2;i++){const r=await post(data);assert.equal(r.status,201);const body=await r.json();assert.deepEqual(Object.keys(body),["message"]);}
    const rows=(await db.query("select foto_path,andamento_caso from adv_clientes where envio_id=$1",[envio])).rows;assert.equal(rows.length,1);assert.equal(rows[0].andamento_caso,data.andamento_caso);assert(blobs.has(rows[0].foto_path));assert.equal(blobs.size,1);assert.equal(uploadCalls,2);
    assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where concluida_em is null")).rows[0].n,0);
  });
  await t.test("arquivo falso é recusado antes de gravar qualquer objeto",async()=>{
    const envio=randomUUID();const count=blobs.size;const r=await post({...input,envio,image:Buffer.from("arquivo que não é imagem").toString("base64")});assert.equal(r.status,422);assert.equal(blobs.size,count);assert.equal((await db.query("select count(*)::int as n from renata_privado.cadastro_fotos where envio_id=$1",[envio])).rows[0].n,0);
  });
  await t.test("limite técnico HTTP recusa corpo excessivo e não grava parcialmente",async()=>{
    const envio=randomUUID();const r=await post({...input,envio,andamento_caso:"x".repeat(3_500_000)});assert.equal(r.status,413);assert.equal((await db.query("select count(*)::int as n from adv_clientes where envio_id=$1",[envio])).rows[0].n,0);
  });
  await t.test("cron recupera arquivo de cadastro interrompido sem alterar clientes existentes",async()=>{
    assert.equal((await fetch(origin+"/api/internal/storage-cleanup")).status,401);
    const envio=randomUUID();const op=await asRole(db,"service_role",undefined,undefined,()=>db.query("select adv_cadastro_foto_preparar($1,$2) as op",[envio,"e".repeat(64)]).then(r=>r.rows[0].op));
    const buffer=blobs.values().next().value;const uploaded=await fetch(`http://127.0.0.1:${backend.address().port}/storage/v1/object/fotos-clientes/${op.path}`,{method:"POST",headers:{apikey:"synthetic-service-key","Content-Type":"image/webp"},body:buffer});assert.equal(uploaded.status,200);
    await db.query("update renata_privado.cadastro_fotos set expira_em=now()-interval '2 days' where envio_id=$1",[envio]);await db.query("update renata_privado.storage_limpezas set disponivel_em=now()-interval '1 minute' where foto_path=$1",[op.path]);
    const snapshot=()=>db.query("select jsonb_agg(to_jsonb(c) order by c.id) as data from adv_clientes c").then(r=>r.rows[0].data);const before=await snapshot();
    const response=await fetch(origin+"/api/internal/storage-cleanup",{headers:{Authorization:"Bearer "+cronSecret}});assert.equal(response.status,200);assert.equal((await response.json()).files,1);assert.deepEqual(await snapshot(),before);assert(!blobs.has(op.path));assert.equal(blobs.size,1);assert.equal((await db.query("select count(*)::int as n from renata_privado.cadastro_fotos where envio_id=$1",[envio])).rows[0].n,0);
  });
  await t.test("dois envios concorrentes com a mesma identidade não duplicam cadastro ou objeto",async()=>{
    const image=(await sharp({create:{width:70,height:90,channels:3,background:"#dcb987"}}).png().toBuffer()).toString("base64");const envio=randomUUID(),data={...input,envio,image};
    const responses=await Promise.all([post(data),post(data)]);assert(responses.every(r=>r.status===201));
    const rows=(await db.query("select foto_path from adv_clientes where envio_id=$1",[envio])).rows;assert.equal(rows.length,1);assert(blobs.has(rows[0].foto_path));assert.equal((await db.query("select count(*)::int as n from renata_privado.storage_limpezas where foto_path=$1",[rows[0].foto_path])).rows[0].n,0);
  });
});
