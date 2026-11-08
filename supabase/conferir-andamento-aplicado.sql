-- SOMENTE LEITURA. Executar DEPOIS do sucesso da migração, não reaplicá-la.
-- Não consulta registros nem chama RPCs da aplicação.
begin transaction read only;
with funcoes(assinatura,hash) as (values ('public.adv_registrar_cliente(jsonb, uuid, text)','695348d6e02193e176ae6bc5435e3201'),
('public.adv_registrar_cliente_com_foto(jsonb, uuid, text)','375e84b25f467b683763d85e2efdd4bb'),
('public.adv_cadastro_foto_preparar(uuid, text)','751339e04e2c7803a8a325b4eefbe789'),
('public.adv_cadastro_fotos_limpar()','dcdf67867030c168b051273661b1742f'))
select f.assinatura,
  exists(select 1 from pg_proc p where p.oid=to_regprocedure(f.assinatura) and not p.prosecdef and 'search_path=""'=any(p.proconfig) and md5(replace(p.prosrc,chr(13),''))=f.hash) as definicao_ok,
  has_function_privilege('service_role',to_regprocedure(f.assinatura),'EXECUTE') as service_execute,
  has_function_privilege('anon',to_regprocedure(f.assinatura),'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',to_regprocedure(f.assinatura),'EXECUTE') as authenticated_execute
from funcoes f;
select p.prosecdef and md5(replace(p.prosrc,chr(13),''))='9a448a4d837c697b4439b8a807ea154d' and 'search_path=""'=any(p.proconfig) as auditoria_ok,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p where p.oid=to_regprocedure('renata_privado.auditar()');
select column_name,data_type,is_nullable,is_generated from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name='andamento_caso';
select has_column_privilege('authenticated','public.adv_clientes','andamento_caso','SELECT') as authenticated_select,has_column_privilege('authenticated','public.adv_clientes','andamento_caso','UPDATE') as authenticated_update,has_column_privilege('anon','public.adv_clientes','andamento_caso','SELECT') as anon_select,has_column_privilege('anon','public.adv_clientes','andamento_caso','UPDATE') as anon_update;
select p.oid::regprocedure::text as assinatura,p.proacl,pg_get_userbyid(p.proowner) as proprietario,md5(replace(p.prosrc,chr(13),'')) as body_md5,md5(pg_get_functiondef(p.oid)) as definition_md5 from pg_proc p where p.oid=to_regprocedure('public.adv_storage_finalizar_exclusoes(uuid)');
select conname,pg_get_constraintdef(oid,true) as definicao from pg_constraint where conrelid=to_regclass('renata_privado.cadastro_fotos');
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and c.relname='adv_clientes') or (n.nspname='renata_privado' and c.relname='cadastro_fotos') or (n.nspname='storage' and c.relname in ('objects','buckets'));
select r.papel,has_any_column_privilege(r.papel,to_regclass('renata_privado.cadastro_fotos'),'SELECT,INSERT,UPDATE') as acesso_colunas,has_table_privilege(r.papel,to_regclass('renata_privado.cadastro_fotos'),'DELETE,TRUNCATE') as exclusao_direta from (values('anon'),('authenticated')) r(papel);
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='fotos-clientes';
rollback;
