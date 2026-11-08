-- Somente metadados; executar no SQL Editor de srvzdpkaqnxvydxinfco.
-- Não consulta cadastros nem fotografias e não executa migrações.
begin transaction read only;
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'adv_clientes'
order by ordinal_position;
select p.proname,pg_get_function_identity_arguments(p.oid) as argumentos,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('adv_registrar_cliente','adv_cadastro_foto_preparar','adv_registrar_cliente_com_foto');
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id = 'fotos-clientes';
select n.nspname,c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('adv_clientes','adv_advogados','adv_observacoes','adv_auditoria'))
   or (n.nspname='renata_privado' and c.relname='cadastro_fotos');
rollback;
