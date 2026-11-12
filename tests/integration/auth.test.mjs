import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium, expect} from '@playwright/test';
import {featureDatabase, asRole} from '../database-fixture.mjs';

test('autenticação real Next/SDK, cookies e navegador contra Auth/Postgres isolados',async t=>{
 const db=await featureDatabase();t.after(()=>db.close());
 for(const file of ['20261107135415_clientes_documentos_fotos_arquivo.sql','20261108183508_andamento_foto_cadastro.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 const accounts=[{id:randomUUID(),oab:'123',role:'gestao'},{id:randomUUID(),oab:'456',role:'consulta'}];
 for(const a of accounts){a.email=a.oab+'@example.test';await db.query('insert into auth.users(id,email) values($1,$2)',[a.id,a.email]);await db.query("insert into public.adv_advogados(auth_user_id,nome,email_login,oab_numero,oab_uf,ativo,permissao) values($1,'Advogado Sintético',$2,$3,'SP',true,$4)",[a.id,a.email,a.oab,a.role]);}
 const password='senha-exclusivamente-sintetica';const access=new Map(),refresh=new Map();let refreshes=0,authUnavailable=false;
 // PGlite has one SQL session. Lease it for each emulated HTTP connection so
 // concurrent users cannot overwrite SET ROLE / JWT of another test request.
 let sqlQueue=Promise.resolve();const sqlLease=fn=>{const result=sqlQueue.then(fn);sqlQueue=result.catch(()=>{});return result;};
 async function newSession(a,session){const sid=session||randomUUID();if(!session)await sqlLease(()=>db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,a.id]));const token=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:a.id,session_id:sid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,jti:randomUUID()})).toString('base64url'),'synthetic'].join('.');const rt=randomUUID();const entry={a,sid,expired:false};access.set(token,entry);refresh.set(rt,entry);return {access_token:token,refresh_token:rt,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(a)};}
 const user=a=>({id:a.id,aud:'authenticated',role:'authenticated',email:a.email,app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()});
 const backend=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,'http://localhost');const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
   if(url.pathname==='/auth/v1/token'){
    if(authUnavailable)return send(503,{message:'Unavailable'});
    if(url.searchParams.get('grant_type')==='password'){const a=accounts.find(a=>a.email===body.email);return a&&body.password===password?send(200,await newSession(a)):send(400,{code:'invalid_credentials',message:'Invalid credentials'});}
    refreshes++;const e=refresh.get(body.refresh_token);if(!e||e.revoked)return send(400,{code:'refresh_token_not_found',message:'Expired'});return send(200,await newSession(e.a,e.sid));
   }
   const token=(req.headers.authorization||'').replace('Bearer ','');const e=access.get(token);
   if(url.pathname==='/auth/v1/user'){if(authUnavailable)return send(503,{message:'Unavailable'});return e&&!e.expired&&!e.revoked?send(200,{user:user(e.a)}):send(401,{code:'bad_jwt',message:'JWT expired'});}
   if(url.pathname==='/auth/v1/logout'){if(e){for(const map of [access,refresh])for(const value of map.values())if(value.sid===e.sid)value.revoked=true;await sqlLease(()=>db.query('delete from auth.sessions where id=$1',[e.sid]));}return send(200,{});}
   if(url.pathname==='/rest/v1/rpc/adv_limitar_tentativas')return send(200,true);
   if(url.pathname==='/rest/v1/adv_advogados'){
    if(req.headers.apikey==='synthetic-service-key'){const a=accounts.find(a=>'eq.'+a.oab===url.searchParams.get('oab_numero'));return send(200,a?[{auth_user_id:a.id,email_login:a.email}]:[]);}
    if(!e||e.revoked)return send(401,{message:'Unauthorized'});
    const r=await sqlLease(()=>asRole(db,'authenticated',e.a.id,e.sid,()=>db.query('select id,nome,oab_numero,oab_uf,permissao from public.adv_advogados where auth_user_id=$1',[e.a.id])));return send(200,r.rows);
   }
   if(url.pathname==='/rest/v1/rpc/adv_listar_clientes_v2')return send(200,[]);
   if(url.pathname==='/rest/v1/rpc/adv_totais_clientes_v2')return send(200,{total:0,novo:0,em_andamento:0,concluido:0});
   return send(404,{message:'Synthetic route missing'});
  }catch{send(500,{message:'Synthetic backend error'});}
 });
 await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>backend.close(resolve)));
 const origin='http://localhost:3196';let logs='';
 const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3196'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,VERCEL:'',APP_ORIGIN:origin,APP_ALLOWED_ORIGINS:'http://127.0.0.1:3196,https://controle-cliente-renata.vercel.app,https://cadastro-adv.vercel.app',SUPABASE_URL:`http://127.0.0.1:${backend.address().port}`,SUPABASE_SECRET_KEY:'synthetic-service-key',SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',APP_HASH_SECRET:'synthetic-key-used-only-in-disposable-integration-tests'}});
 app.stdout.on('data',b=>{logs+=b;});app.stderr.on('data',b=>{logs+=b;});t.after(()=>app.kill());
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const post=(path,data,extra={})=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(data)});
 const cookie=r=>r.headers.getSetCookie().filter(v=>v.includes('Path=/api/admin')&&!v.includes('Max-Age=0')).map(v=>v.split(';')[0]).join('; ');
 let management,consultation;
 await t.test('login de gestão e consulta, acesso válido e isolamento concorrente',async()=>{
  const results=await Promise.all(accounts.map(a=>post('/api/admin/sessao',{oab:a.oab,uf:'SP',senha:password})));
  for(let i=0;i<2;i++){assert.equal(results[i].status,200);assert.equal((await results[i].json()).lawyer.permissao,accounts[i].role);const headers=results[i].headers.getSetCookie();assert(headers.some(c=>c.includes('HttpOnly')&&/SameSite=lax/i.test(c)&&c.includes('Max-Age=604800')&&!c.includes('Domain=')),JSON.stringify(headers.map(c=>c.slice(c.indexOf(';')))));}
  management=cookie(results[0]);consultation=cookie(results[1]);assert(management&&consultation&&management!==consultation);
  const states=await Promise.all([management,consultation].map(Cookie=>fetch(origin+'/api/admin/sessao',{headers:{Cookie}}).then(r=>r.json())));assert.deepEqual(states.map(s=>s.lawyer.permissao),['gestao','consulta']);
  const denied=await post('/api/admin/clientes',{action:'status',id:randomUUID(),status:'concluido',version:1},{Cookie:consultation});assert.equal(denied.status,403);
 });
 await t.test('senha incorreta não apaga sessão válida; JWT expirado renova pelo SDK',async()=>{
  const failed=await post('/api/admin/sessao',{oab:'123',uf:'SP',senha:'incorreta'},{Cookie:management});assert.equal(failed.status,401);assert.equal(failed.headers.getSetCookie().length,0);
  const raw=management.slice(management.indexOf('=')+1);const session=JSON.parse(Buffer.from(raw.slice('base64-'.length),'base64url').toString());session.expires_at=Math.floor(Date.now()/1000)-120;
  const expired='renata-sessao=base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');const before=refreshes;
  const r=await fetch(origin+'/api/admin/sessao',{headers:{Cookie:expired}});assert.equal(r.status,200);assert.equal(refreshes,before+1);management=cookie(r);assert(management);
 });
 await t.test('rejeição do access token renova uma vez e persiste cookies de resposta',async()=>{
  for(const e of access.values())if(e.a.role==='gestao')e.expired=true;const before=refreshes;
  const r=await fetch(origin+'/api/admin/sessao',{headers:{Cookie:management}});assert.equal(r.status,200);assert.equal(refreshes,before+1);management=cookie(r);assert(management);
 });
 await t.test('expiração definitiva, mensagem clara e reautenticação sem limpar navegador',async()=>{
  for(const e of [...access.values(),...refresh.values()])if(e.a.role==='gestao')e.revoked=true;
  const r=await fetch(origin+'/api/admin/sessao',{headers:{Cookie:management}});assert.equal(r.status,401);assert.equal((await r.json()).code,'SESSION_EXPIRED');
  assert(r.headers.getSetCookie().some(c=>c.includes('Path=/;')&&c.includes('Max-Age=0')));assert(r.headers.getSetCookie().some(c=>c.includes('Path=/api/admin')&&c.includes('Max-Age=0')));
  const login=await post('/api/admin/sessao',{oab:'123',uf:'SP',senha:password},{Cookie:management});assert.equal(login.status,200);management=cookie(login);
 });
 await t.test('CSRF, forwarded spoof e origem ausente não alcançam autenticação',async()=>{
  for(const extra of [{Origin:'https://example.invalid','X-Forwarded-Host':'localhost:3196'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}]){const r=await post('/api/admin/sessao',{oab:'123',uf:'SP',senha:password},extra);assert.equal(r.status,403);assert.equal((await r.json()).code,'ORIGIN_REJECTED');}
  const missing=await fetch(origin+'/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(missing.status,403);
  const alias=await fetch('http://127.0.0.1:3196/api/cadastro',{method:'POST',headers:{Origin:'http://127.0.0.1:3196','Content-Type':'application/json','X-Forwarded-Host':'evil.invalid'},body:'{}'});assert.equal(alias.status,422);
 });
 await t.test('indisponibilidade não encerra uma sessão válida nem expõe logs sensíveis',async()=>{
  authUnavailable=true;try{const r=await fetch(origin+'/api/admin/sessao',{headers:{Cookie:management}});assert.equal(r.status,503);assert.equal(r.headers.getSetCookie().length,0);}finally{authUnavailable=false;}
  assert.equal((await fetch(origin+'/api/admin/sessao',{headers:{Cookie:management}})).status,200);
  assert(logs.includes('ORIGIN_ORIGIN_NOT_ALLOWED'));assert(!logs.includes(password));assert(!logs.includes(accounts[0].email));for(const token of access.keys())assert(!logs.includes(token));
 });
 await t.test('sessão além dos sete dias permanece recusada pela RLS',async()=>{
  const e=[...access.values()].findLast(e=>e.a.role==='consulta');await db.query("update auth.sessions set created_at=now()-interval '8 days' where id=$1",[e.sid]);assert.equal((await fetch(origin+'/api/admin/sessao',{headers:{Cookie:consultation}})).status,401);
 });
 await t.test('navegador móvel com cookies antigos, reload, novo servidor, logout e novo login',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   await context.addCookies([{name:'renata-sessao',value:'antigo-invalido',domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage();await page.goto(origin+'/admin');await page.getByRole('textbox',{name:'Número da OAB',exact:true}).fill('123');await page.getByRole('combobox',{name:'Estado da OAB (UF)'}).selectOption('SP');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
   await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();
   const saved=await context.cookies();assert(!saved.some(c=>c.name==='renata-sessao'&&c.path==='/'));
   // Outra instância por requisição já foi usada no reload. Reiniciar o servidor
   // local também não deve invalidar os cookies persistidos pelo Supabase.
   app.kill();await new Promise(resolve=>app.once('exit',resolve));
   const replacement=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port','3196'],{windowsHide:true,stdio:'ignore',env:{...process.env,VERCEL:'',APP_ORIGIN:origin,APP_ALLOWED_ORIGINS:'http://127.0.0.1:3196',SUPABASE_URL:`http://127.0.0.1:${backend.address().port}`,SUPABASE_SECRET_KEY:'synthetic-service-key',SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',APP_HASH_SECRET:'synthetic-key-used-only-in-disposable-integration-tests'}});t.after(()=>replacement.kill());
   for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
   await page.reload();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
   await page.getByRole('textbox',{name:'Número da OAB',exact:true}).fill('123');await page.getByRole('combobox',{name:'Estado da OAB (UF)'}).selectOption('SP');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('button',{name:'Sair',exact:true})).toBeVisible();await context.close();
  }finally{await browser.close();}
 });
});
