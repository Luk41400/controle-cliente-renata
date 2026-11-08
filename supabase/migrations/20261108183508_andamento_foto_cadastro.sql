-- srvzdpkaqnxvydxinfco: revisar metadados antes da execução única no SQL Editor.
-- Não modifica conteúdos existentes, não publica o bucket nem altera a autenticação.
-- Não redefine e NÃO chama adv_storage_finalizar_exclusoes.
-- INSERT/UPDATE/DELETE abaixo existem apenas dentro de funções, para chamadas futuras.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $$
begin
  if to_regprocedure('public.adv_cadastro_foto_preparar(uuid,text)') is not null
    or to_regprocedure('public.adv_registrar_cliente_com_foto(jsonb,uuid,text)') is not null
    or to_regprocedure('public.adv_cadastro_fotos_limpar()') is not null
    or to_regclass('renata_privado.cadastro_fotos') is not null then
    raise exception 'A atualização de foto inicial já existe total ou parcialmente. Confira os metadados e não reaplique a migração.';
  end if;
  if to_regprocedure('public.adv_foto_preparar(uuid,integer,uuid,text)') is null then
    raise exception 'A migração de fotografias de 20261107135415 deve estar aplicada.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name='andamento_caso')
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes'
      and column_name in ('andamento','andamento_do_caso','andamento_juridico','progresso_caso')) then
    raise exception 'Já existe uma possível coluna de andamento. Revise os metadados para reutilizá-la antes de migrar.';
  end if;
end $$;
-- BEGIN PREFLIGHT FOTO ANDAMENTO
do $preflight$
declare falhas text;
begin
  select string_agg(item, ', ' order by item) into falhas from (
with
relacoes(nome) as (values ('public.adv_clientes'),
('public.adv_advogados'),
('public.adv_observacoes'),
('public.adv_auditoria'),
('renata_privado.retencao_clientes'),
('renata_privado.foto_operacoes'),
('renata_privado.storage_limpezas'),
('renata_privado.exclusoes'),
('renata_privado.tentativas'),
('auth.sessions'),
('storage.objects'),
('storage.buckets')),
colunas(tabela,coluna,tipo) as (values ('auth.sessions','id','uuid'),
('auth.sessions','user_id','uuid'),
('auth.sessions','created_at','timestamp with time zone'),
('auth.sessions','not_after','timestamp with time zone'),
('public.adv_advogados','id','uuid'),
('public.adv_advogados','auth_user_id','uuid'),
('public.adv_advogados','nome','text'),
('public.adv_advogados','email_login','text'),
('public.adv_advogados','oab_numero','text'),
('public.adv_advogados','oab_uf','character(2)'),
('public.adv_advogados','ativo','boolean'),
('public.adv_advogados','criado_em','timestamp with time zone'),
('public.adv_advogados','permissao','text'),
('public.adv_auditoria','id','uuid'),
('public.adv_auditoria','cliente_id','uuid'),
('public.adv_auditoria','advogado_id','uuid'),
('public.adv_auditoria','acao','text'),
('public.adv_auditoria','criado_em','timestamp with time zone'),
('public.adv_auditoria','advogado_nome','text'),
('public.adv_auditoria','detalhes','jsonb'),
('public.adv_clientes','id','uuid'),
('public.adv_clientes','nome','text'),
('public.adv_clientes','nome_social','text'),
('public.adv_clientes','endereco','text'),
('public.adv_clientes','rg','text'),
('public.adv_clientes','cpf','character varying(11)'),
('public.adv_clientes','filiacao','text'),
('public.adv_clientes','nacionalidade','text'),
('public.adv_clientes','cidade_nascimento','text'),
('public.adv_clientes','caso_juridico','text'),
('public.adv_clientes','status','text'),
('public.adv_clientes','criado_em','timestamp with time zone'),
('public.adv_clientes','atualizado_em','timestamp with time zone'),
('public.adv_clientes','versao','integer'),
('public.adv_clientes','envio_id','uuid'),
('public.adv_clientes','envio_hash','text'),
('public.adv_clientes','tipo_caso','text'),
('public.adv_clientes','arquivado_em','timestamp with time zone'),
('public.adv_clientes','arquivado_por','uuid'),
('public.adv_clientes','foto_path','text'),
('public.adv_clientes','exclusao_em','timestamp with time zone'),
('public.adv_observacoes','id','uuid'),
('public.adv_observacoes','cliente_id','uuid'),
('public.adv_observacoes','advogado_id','uuid'),
('public.adv_observacoes','texto','text'),
('public.adv_observacoes','criado_em','timestamp with time zone'),
('public.adv_observacoes','advogado_nome','text'),
('renata_privado.exclusoes','id','uuid'),
('renata_privado.exclusoes','cliente_id','uuid'),
('renata_privado.exclusoes','advogado_id','uuid'),
('renata_privado.exclusoes','autorizada_em','timestamp with time zone'),
('renata_privado.exclusoes','concluida_em','timestamp with time zone'),
('renata_privado.exclusoes','retencao_referencia','text'),
('renata_privado.foto_operacoes','id','uuid'),
('renata_privado.foto_operacoes','cliente_id','uuid'),
('renata_privado.foto_operacoes','advogado_id','uuid'),
('renata_privado.foto_operacoes','versao','integer'),
('renata_privado.foto_operacoes','foto_path','text'),
('renata_privado.foto_operacoes','conteudo_hash','text'),
('renata_privado.foto_operacoes','substituicao','boolean'),
('renata_privado.foto_operacoes','concluida','boolean'),
('renata_privado.foto_operacoes','expira_em','timestamp with time zone'),
('renata_privado.retencao_clientes','cliente_id','uuid'),
('renata_privado.retencao_clientes','versao','integer'),
('renata_privado.retencao_clientes','liberada_em','timestamp with time zone'),
('renata_privado.retencao_clientes','valida_ate','timestamp with time zone'),
('renata_privado.retencao_clientes','aprovado_por','uuid'),
('renata_privado.retencao_clientes','referencia','text'),
('renata_privado.storage_limpezas','id','uuid'),
('renata_privado.storage_limpezas','cliente_id','uuid'),
('renata_privado.storage_limpezas','foto_path','text'),
('renata_privado.storage_limpezas','disponivel_em','timestamp with time zone'),
('renata_privado.storage_limpezas','token','uuid'),
('renata_privado.storage_limpezas','lease_ate','timestamp with time zone'),
('renata_privado.storage_limpezas','concluida_em','timestamp with time zone'),
('renata_privado.tentativas','chave','text'),
('renata_privado.tentativas','ate','timestamp with time zone'),
('renata_privado.tentativas','total','integer'),
('storage.buckets','id','text'),
('storage.buckets','name','text'),
('storage.buckets','public','boolean'),
('storage.buckets','file_size_limit','bigint'),
('storage.buckets','allowed_mime_types','text[]'),
('storage.objects','id','uuid'),
('storage.objects','bucket_id','text'),
('storage.objects','name','text')),
funcoes(assinatura,definer,resultado,hash_esperado) as (values ('public.adv_cliente_arquivar(uuid, integer, boolean)',false,'void',null::text),
('public.adv_cliente_excluir(uuid, integer, uuid)',false,'uuid',null::text),
('public.adv_cliente_exclusao_estado(uuid)',false,'text',null::text),
('public.adv_cliente_pode_excluir(uuid)',false,'boolean',null::text),
('public.adv_foto_concluir(uuid)',false,'void',null::text),
('public.adv_foto_preparar(uuid, integer, uuid, text)',false,'jsonb',null::text),
('public.adv_foto_remover(uuid, integer)',false,'void',null::text),
('public.adv_limitar_tentativas(text, integer, integer)',false,'boolean',null::text),
('public.adv_listar_clientes(text, text, date, date)',false,'TABLE(id uuid, nome text, criado_em timestamp with time zone, status text)',null::text),
('public.adv_listar_clientes_v2(text, text, date, date, boolean)',false,'TABLE(id uuid, nome text, criado_em timestamp with time zone, status text, tipo_caso text, arquivado_em timestamp with time zone, tem_foto boolean)',null::text),
('public.adv_registrar_cliente(jsonb, uuid, text)',false,'boolean','e05f414b1d041f876de772d1910372cc'),
('public.adv_storage_concluir(uuid[], uuid[])',false,'void',null::text),
('public.adv_storage_finalizar_exclusoes(uuid)',false,'integer',null::text),
('public.adv_storage_pendentes(uuid)',false,'bigint',null::text),
('public.adv_storage_recolher(uuid)',false,'TABLE(id uuid, foto_path text, token uuid)',null::text),
('public.adv_totais_clientes()',false,'json',null::text),
('public.adv_totais_clientes_v2(boolean)',false,'json',null::text),
('renata_privado.arquivar(uuid, integer, boolean)',true,'void',null::text),
('renata_privado.auditar()',true,'trigger','35ea3063112d9f5e5dbd7e188d3d901b'),
('renata_privado.cliente_para_alterar(uuid, integer)',true,'adv_clientes',null::text),
('renata_privado.cliente_validar()',true,'trigger','ee704fae6debdb408cd17ad35e83d390'),
('renata_privado.cpf_valido(text)',false,'boolean',null::text),
('renata_privado.excluir(uuid, integer, uuid)',true,'uuid',null::text),
('renata_privado.exclusao_estado(uuid)',true,'text',null::text),
('renata_privado.exigir_gestao()',true,'uuid',null::text),
('renata_privado.foto_concluir(uuid)',true,'void',null::text),
('renata_privado.foto_preparar(uuid, integer, uuid, text)',true,'jsonb',null::text),
('renata_privado.foto_remover(uuid, integer)',true,'void',null::text),
('renata_privado.observacao_preparar()',true,'trigger','211b6a6d04e08a090c05f731de7c5ab2'),
('renata_privado.permissao_atual()',true,'text','5a29c8ce003ab98aca5dfafaf6963b39'),
('renata_privado.pode_excluir(uuid)',true,'boolean',null::text),
('renata_privado.pode_ler_foto(text)',true,'boolean','ecbb31f0a8570e5400cbaad441348df8')),
politicas(tabela,nome,comando,papeis,expressao,checagem) as (values ('public.adv_advogados','renata_restringir_perfil','r','authenticated','((auth_user_id = ( SELECT auth.uid() AS uid)) AND (( SELECT renata_privado.permissao_atual() AS permissao_atual) IS NOT NULL))',''),
('public.adv_advogados','renata_sem_acesso_anonimo','*','anon','false','false'),
('public.adv_auditoria','renata_auditoria_cliente_visivel','r','authenticated','((cliente_id IS NULL) OR (EXISTS ( SELECT 1
   FROM adv_clientes c
  WHERE (c.id = adv_auditoria.cliente_id))))',''),
('public.adv_auditoria','renata_restringir_auditoria_leitura','r','authenticated','(( SELECT renata_privado.permissao_atual() AS permissao_atual) IS NOT NULL)',''),
('public.adv_auditoria','renata_sem_acesso_anonimo','*','anon','false','false'),
('public.adv_clientes','renata_cliente_em_exclusao','*','authenticated','(exclusao_em IS NULL)','(exclusao_em IS NULL)'),
('public.adv_clientes','renata_restringir_clientes_edicao','w','authenticated','(( SELECT renata_privado.permissao_atual() AS permissao_atual) = ''gestao''::text)','(( SELECT renata_privado.permissao_atual() AS permissao_atual) = ''gestao''::text)'),
('public.adv_clientes','renata_restringir_clientes_leitura','r','authenticated','(( SELECT renata_privado.permissao_atual() AS permissao_atual) IS NOT NULL)',''),
('public.adv_clientes','renata_sem_acesso_anonimo','*','anon','false','false'),
('public.adv_observacoes','renata_observacao_cliente_visivel','*','authenticated','(EXISTS ( SELECT 1
   FROM adv_clientes c
  WHERE (c.id = adv_observacoes.cliente_id)))','(EXISTS ( SELECT 1
   FROM adv_clientes c
  WHERE (c.id = adv_observacoes.cliente_id)))'),
('public.adv_observacoes','renata_restringir_observacoes_insercao','a','authenticated','','((advogado_id = ( SELECT a.id
   FROM adv_advogados a
  WHERE (a.auth_user_id = ( SELECT auth.uid() AS uid)))) AND (( SELECT renata_privado.permissao_atual() AS permissao_atual) = ''gestao''::text))'),
('public.adv_observacoes','renata_restringir_observacoes_leitura','r','authenticated','(( SELECT renata_privado.permissao_atual() AS permissao_atual) IS NOT NULL)',''),
('public.adv_observacoes','renata_sem_acesso_anonimo','*','anon','false','false'),
('storage.objects','renata_fotos_alteracao_servidor','w','authenticated','(bucket_id <> ''fotos-clientes''::text)','(bucket_id <> ''fotos-clientes''::text)'),
('storage.objects','renata_fotos_escrita_servidor','a','authenticated','','(bucket_id <> ''fotos-clientes''::text)'),
('storage.objects','renata_fotos_remocao_servidor','d','authenticated','(bucket_id <> ''fotos-clientes''::text)',''),
('storage.objects','renata_fotos_restricao_leitura','r','authenticated','((bucket_id <> ''fotos-clientes''::text) OR renata_privado.pode_ler_foto(name))',''),
('storage.objects','renata_fotos_sem_publico','*','anon','(bucket_id <> ''fotos-clientes''::text)','(bucket_id <> ''fotos-clientes''::text)')),
acls(assinatura,anon,authenticated,servico) as (values ('public.adv_cliente_arquivar(uuid, integer, boolean)',false,true,false),
('public.adv_cliente_excluir(uuid, integer, uuid)',false,true,false),
('public.adv_cliente_exclusao_estado(uuid)',false,true,false),
('public.adv_cliente_pode_excluir(uuid)',false,true,false),
('public.adv_foto_concluir(uuid)',false,true,false),
('public.adv_foto_preparar(uuid, integer, uuid, text)',false,true,false),
('public.adv_foto_remover(uuid, integer)',false,true,false),
('public.adv_limitar_tentativas(text, integer, integer)',false,false,true),
('public.adv_listar_clientes(text, text, date, date)',false,true,false),
('public.adv_listar_clientes_v2(text, text, date, date, boolean)',false,true,false),
('public.adv_registrar_cliente(jsonb, uuid, text)',false,false,true),
('public.adv_storage_concluir(uuid[], uuid[])',false,false,true),
('public.adv_storage_finalizar_exclusoes(uuid)',false,false,true),
('public.adv_storage_pendentes(uuid)',false,false,true),
('public.adv_storage_recolher(uuid)',false,false,true),
('public.adv_totais_clientes()',false,true,false),
('public.adv_totais_clientes_v2(boolean)',false,true,false),
('renata_privado.arquivar(uuid, integer, boolean)',false,true,false),
('renata_privado.auditar()',false,false,false),
('renata_privado.cliente_para_alterar(uuid, integer)',false,false,false),
('renata_privado.cliente_validar()',false,false,false),
('renata_privado.cpf_valido(text)',false,false,false),
('renata_privado.excluir(uuid, integer, uuid)',false,true,false),
('renata_privado.exclusao_estado(uuid)',false,true,false),
('renata_privado.exigir_gestao()',false,false,false),
('renata_privado.foto_concluir(uuid)',false,true,false),
('renata_privado.foto_preparar(uuid, integer, uuid, text)',false,true,false),
('renata_privado.foto_remover(uuid, integer)',false,true,false),
('renata_privado.observacao_preparar()',false,false,false),
('renata_privado.permissao_atual()',false,true,false),
('renata_privado.pode_excluir(uuid)',false,true,false),
('renata_privado.pode_ler_foto(text)',false,true,false)),
checagens as (
 select 'tabela:'||r.nome as item, c.oid is not null as ok, 'A dependência deve existir antes da migração.' as detalhe
 from relacoes r left join pg_class c on c.oid=to_regclass(r.nome)
 union all
 select 'coluna:'||c.tabela||'.'||c.coluna, exists(select 1 from pg_attribute a where a.attrelid=to_regclass(c.tabela) and a.attname=c.coluna and a.attnum>0 and not a.attisdropped and a.atttypid=to_regtype(c.tipo)), 'Tipo esperado: '||c.tipo from colunas c
 union all
 select 'funcao:'||f.assinatura, exists(select 1 from pg_proc p where p.oid=to_regprocedure(f.assinatura) and p.prokind='f' and p.prosecdef=f.definer and (not f.definer or ('search_path=""'=any(p.proconfig) and not pg_has_role('anon',p.proowner,'USAGE') and not pg_has_role('authenticated',p.proowner,'USAGE'))) and pg_get_function_result(p.oid)=f.resultado and (f.hash_esperado is null or md5(replace(p.prosrc,chr(13),''))=f.hash_esperado)),
   'Assinatura/segurança/retorno' || case when f.hash_esperado is null then '.' else '; hash esperado '||f.hash_esperado||', atual '||coalesce((select md5(replace(p.prosrc,chr(13),'')) from pg_proc p where p.oid=to_regprocedure(f.assinatura)),'ausente') end from funcoes f
 union all
 select 'politica:'||p.tabela||'.'||p.nome, exists(select 1 from pg_policy x where x.polrelid=to_regclass(p.tabela) and x.polname=p.nome and not x.polpermissive and x.polcmd::text=p.comando
   and (select string_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end,',' order by r) from unnest(x.polroles) r)=p.papeis
   and coalesce(pg_get_expr(x.polqual,x.polrelid),'')=p.expressao and coalesce(pg_get_expr(x.polwithcheck,x.polrelid),'')=p.checagem), 'Política restritiva, papéis e expressões esperados.' from politicas p
 union all
 select 'rls:'||r.nome, coalesce(c.relrowsecurity,false), 'RLS precisa estar habilitado.' from relacoes r left join pg_class c on c.oid=to_regclass(r.nome) where r.nome not like 'auth.%'
 union all
 select 'papel:'||v.nome, exists(select 1 from pg_roles r where r.rolname=v.nome and not r.rolsuper and r.rolbypassrls=v.bypass), 'BYPASSRLS esperado: '||v.bypass::text from (values('anon',false),('authenticated',false),('service_role',true)) v(nome,bypass)
 union all
 select 'isolamento_papel:'||r.nome, not pg_has_role(r.nome,'service_role','MEMBER'), 'Papel do navegador não pode herdar service_role.' from (values('anon'),('authenticated')) r(nome)
 union all
 select 'proprietario:'||r.nome||':'||v.papel, not pg_has_role(v.papel,c.relowner,'USAGE'), 'Papel do navegador não pode ser proprietário nem herdar o proprietário.' from relacoes r join pg_class c on c.oid=to_regclass(r.nome) cross join (values('anon'),('authenticated')) v(papel) where r.nome not like 'auth.%'
 union all
 select 'schema_service:'||s.nome, has_schema_privilege('service_role',to_regnamespace(s.nome),'USAGE'), 'Service role precisa usar o schema.' from (values('public'),('renata_privado'),('storage')) s(nome)
 union all
 select 'anon_sem_dados:'||r.nome, not has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE') and not has_table_privilege('anon',c.oid,'DELETE,TRUNCATE'), 'Anon não deve ter privilégios nos dados da aplicação.' from relacoes r join pg_class c on c.oid=to_regclass(r.nome) where r.nome like 'public.%' or r.nome like 'renata_privado.%'
 union all
 select 'privado_sem_authenticated:'||r.nome, not has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE') and not has_table_privilege('authenticated',c.oid,'DELETE,TRUNCATE'), 'Authenticated não acessa tabelas internas.' from relacoes r join pg_class c on c.oid=to_regclass(r.nome) where r.nome like 'renata_privado.%'
 union all
 select 'cliente_escrita_restrita', not has_table_privilege('authenticated',to_regclass('public.adv_clientes'),'INSERT,UPDATE,DELETE,TRUNCATE')
   and not coalesce((select has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE') from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='foto_path' and a.attnum>0 and not a.attisdropped),true)
   and not coalesce((select has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE') from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='arquivado_em' and a.attnum>0 and not a.attisdropped),true)
   and not coalesce((select has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE') from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='exclusao_em' and a.attnum>0 and not a.attisdropped),true), 'Gestão usa RLS/colunas e RPCs; não pode ter escrita indiscriminada.'
 union all
 select 'servico_privilegio:'||v.tabela||':'||v.privilegio, has_table_privilege('service_role',to_regclass(v.tabela),v.privilegio), 'Privilégio necessário para cadastro ou rotinas existentes.' from (values
 ('public.adv_clientes','INSERT'),('public.adv_clientes','DELETE'),
 ('public.adv_observacoes','DELETE'),('public.adv_auditoria','INSERT'),('public.adv_auditoria','DELETE'),
 ('renata_privado.storage_limpezas','SELECT'),('renata_privado.storage_limpezas','INSERT'),('renata_privado.storage_limpezas','UPDATE'),('renata_privado.storage_limpezas','DELETE'),
 ('renata_privado.foto_operacoes','SELECT'),('renata_privado.foto_operacoes','DELETE'),
 ('renata_privado.exclusoes','SELECT'),('renata_privado.exclusoes','UPDATE'),
 ('renata_privado.tentativas','SELECT'),('renata_privado.tentativas','INSERT'),('renata_privado.tentativas','UPDATE'),('renata_privado.tentativas','DELETE')) v(tabela,privilegio)
 union all
 select 'servico_coluna:'||v.tabela||'.'||v.coluna, coalesce((select has_column_privilege('service_role',a.attrelid,a.attnum,'SELECT') from pg_attribute a where a.attrelid=to_regclass(v.tabela) and a.attname=v.coluna and a.attnum>0 and not a.attisdropped),false), 'SELECT necessário; acesso ao Storage binário continua somente pela API.' from (values
 ('public.adv_clientes','id'),('public.adv_clientes','envio_id'),('public.adv_clientes','envio_hash'),('public.adv_clientes','foto_path'),('public.adv_clientes','exclusao_em'),
 ('public.adv_advogados','id'),('public.adv_advogados','nome'),('public.adv_advogados','auth_user_id'),('public.adv_advogados','email_login'),('public.adv_advogados','oab_numero'),('public.adv_advogados','oab_uf'),('public.adv_advogados','ativo'),
 ('public.adv_observacoes','cliente_id'),('public.adv_auditoria','cliente_id'),('storage.objects','bucket_id'),('storage.objects','name')) v(tabela,coluna)
 union all
 select 'documentos_nulos', exists(select 1 from pg_attribute where attrelid=to_regclass('public.adv_clientes') and attname='rg' and not attnotnull) and exists(select 1 from pg_attribute where attrelid=to_regclass('public.adv_clientes') and attname='cpf' and not attnotnull), 'RG e CPF precisam aceitar NULL.'
 union all
 select 'andamento_sem_restricao_preexistente', not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='andamento_caso' and not a.attisdropped and (a.atttypid<>'pg_catalog.text'::regtype or a.attnotnull or a.attgenerated<>'' or exists(select 1 from pg_constraint k where k.conrelid=a.attrelid and k.contype='c' and a.attnum=any(k.conkey)))), 'Não removeremos limites/domínios existentes automaticamente; revise antes de migrar.'
 union all
 select 'servico_lock_cliente',has_any_column_privilege('service_role',to_regclass('public.adv_clientes'),'UPDATE'),'SELECT FOR UPDATE do finalizador existente exige UPDATE em pelo menos uma coluna.'
 union all
 select 'acl_funcao:'||f.assinatura,has_function_privilege('anon',to_regprocedure(f.assinatura),'EXECUTE')=f.anon and has_function_privilege('authenticated',to_regprocedure(f.assinatura),'EXECUTE')=f.authenticated and has_function_privilege('service_role',to_regprocedure(f.assinatura),'EXECUTE')=f.servico,'EXECUTE deve corresponder aos papéis definidos pelas migrações anteriores.' from acls f
 union all
 select 'rpc_servico:'||f.assinatura, has_function_privilege('service_role',to_regprocedure(f.assinatura),'EXECUTE') and not has_function_privilege('anon',to_regprocedure(f.assinatura),'EXECUTE') and not has_function_privilege('authenticated',to_regprocedure(f.assinatura),'EXECUTE'), 'RPC deve ser exclusiva de service_role.' from funcoes f where f.assinatura like 'public.adv_storage_%' or f.assinatura like 'public.adv_registrar_cliente(%' or f.assinatura like 'public.adv_limitar_tentativas(%'
 union all
 select 'auth_funcao:'||f.nome, to_regprocedure(f.nome) is not null, 'Dependência do Supabase Auth.' from (values('auth.uid()'),('auth.jwt()'),('pg_catalog.gen_random_uuid()')) f(nome)
 union all
 select 'gatilho:'||v.nome, exists(select 1 from pg_trigger t where t.tgrelid=to_regclass(v.tabela) and t.tgname=v.nome and t.tgfoid=to_regprocedure(v.funcao) and t.tgenabled in ('O','A') and t.tgtype=v.tipo), 'Gatilho esperado e habilitado.' from (values
 ('public.adv_clientes','renata_validar_cliente','renata_privado.cliente_validar()',23),('public.adv_clientes','renata_auditar_cliente','renata_privado.auditar()',21),('public.adv_observacoes','renata_preparar_observacao','renata_privado.observacao_preparar()',7),('public.adv_observacoes','renata_auditar_observacao','renata_privado.auditar()',5)) v(tabela,nome,funcao,tipo)
 union all
 select 'unicidade:'||v.tabela||'.'||v.coluna, exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname=v.coluna where i.indrelid=to_regclass(v.tabela) and i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum), 'ON CONFLICT exige índice único imediato sem filtro.' from (values('public.adv_clientes','envio_id'),('public.adv_clientes','id'),('renata_privado.storage_limpezas','foto_path')) v(tabela,coluna)
 union all
 select 'constraint_cliente:'||v.nome, exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.adv_clientes') and c.contype='c' and c.conname=v.nome and c.convalidated and pg_get_expr(c.conbin,c.conrelid)=v.expressao), 'Constraint de validação existente precisa estar preservada e validada.' from (values ('adv_clientes_caso_juridico_check','(char_length(btrim(caso_juridico)) >= 10)'),
('adv_clientes_cidade_nascimento_check','(char_length(btrim(cidade_nascimento)) >= 2)'),
('adv_clientes_cpf_check','((cpf)::text ~ ''^[0-9]{11}$''::text)'),
('adv_clientes_endereco_check','(char_length(btrim(endereco)) >= 5)'),
('adv_clientes_filiacao_check','(char_length(btrim(filiacao)) >= 2)'),
('adv_clientes_foto_path_check','(foto_path ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$''::text)'),
('adv_clientes_nacionalidade_check','(char_length(btrim(nacionalidade)) >= 2)'),
('adv_clientes_nome_check','((char_length(btrim(nome)) >= 2) AND (char_length(btrim(nome)) <= 200))'),
('adv_clientes_rg_check','(char_length(btrim(rg)) >= 3)'),
('adv_clientes_status_check','(status = ANY (ARRAY[''novo''::text, ''em_andamento''::text, ''concluido''::text]))'),
('adv_clientes_tipo_caso_check','(tipo_caso = ANY (ARRAY[''administrativo''::text, ''judicial''::text]))')) v(nome,expressao)
 union all
 select 'bucket_privado', exists(select 1 from storage.buckets where id='fotos-clientes' and public=false and file_size_limit=5242880 and 'image/webp'=any(allowed_mime_types)), 'Bucket existente privado, 5 MB, WEBP aceito.'
 union all
 select 'coluna_andamento_compativel', not exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name='andamento_caso' and (data_type<>'text' or is_nullable<>'YES' or is_generated<>'NEVER')), 'Se presente, precisa ser TEXT NULL não gerada.'
 union all
 select 'sem_coluna_equivalente', exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name='andamento_caso') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes' and column_name in ('andamento','andamento_do_caso','andamento_juridico','progresso_caso')), 'Revise/reutilize coluna equivalente com outro nome.'
 union all
 select 'schema_privado_na_data_api', case when current_setting('pgrst.db_schemas',true) is null then true else not ('renata_privado'=any(regexp_split_to_array(current_setting('pgrst.db_schemas',true),'[[:space:]]*,[[:space:]]*'))) end, 'Se a configuração não estiver no banco, confira Exposed schemas no painel; nunca exponha renata_privado.'
)
select item,coalesce(ok,false) as ok,detalhe from checagens
) verificacoes where not ok;
  if falhas is not null then raise exception 'Compatibilidade/segurança pendente: %. Nenhum conteúdo foi alterado.',falhas; end if;
end
$preflight$;
-- END PREFLIGHT FOTO ANDAMENTO

alter table public.adv_clientes add column if not exists andamento_caso text;
do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes'
    and column_name='andamento_caso' and data_type='text' and is_nullable='YES') then
    raise exception 'A coluna de andamento existente deve ser TEXT e aceitar NULL. Nenhum conteúdo foi modificado.';
  end if;
end $$;
revoke all (andamento_caso) on public.adv_clientes from public,anon,authenticated;
grant select (andamento_caso), update (andamento_caso) on public.adv_clientes to authenticated;

-- Operação pública mediada pelo servidor. Nenhum papel do navegador acessa esta tabela.
-- O identificador do cliente é reservado antes do INSERT, sem conter dados pessoais.
create table renata_privado.cadastro_fotos (
  envio_id uuid primary key,
  cliente_id uuid not null default gen_random_uuid(),
  -- FK nula enquanto o cadastro está pendente; associada na mesma transação do INSERT.
  -- CASCADE é somente do cliente para estes metadados novos, nunca no sentido inverso.
  cliente_vinculado uuid references public.adv_clientes(id) on delete cascade,
  check (cliente_vinculado is null or cliente_vinculado = cliente_id),
  envio_hash text not null check (envio_hash ~ '^[0-9a-f]{64}$'),
  foto_path text not null unique,
  expira_em timestamptz not null default (now() + interval '5 minutes')
);
create index renata_cadastro_fotos_cliente on renata_privado.cadastro_fotos(cliente_id);
create index renata_cadastro_fotos_vinculo on renata_privado.cadastro_fotos(cliente_vinculado) where cliente_vinculado is not null;
alter table renata_privado.cadastro_fotos enable row level security;
revoke all on renata_privado.cadastro_fotos from public,anon,authenticated;
grant select,insert,update,delete on renata_privado.cadastro_fotos to service_role;

create function public.adv_cadastro_foto_preparar(p_envio uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare operacao renata_privado.cadastro_fotos;
declare hash_atual text;
declare novo_id uuid := gen_random_uuid();
begin
  if p_envio is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Envio inválido' using errcode='22023'; end if;
  select envio_hash into hash_atual from public.adv_clientes where envio_id = p_envio;
  if found then
    if hash_atual <> p_hash then raise exception 'Envio alterado' using errcode='22023'; end if;
    return jsonb_build_object('concluida',true);
  end if;
  insert into renata_privado.cadastro_fotos(envio_id,cliente_id,envio_hash,foto_path)
  values(p_envio,novo_id,p_hash,novo_id::text || '/' || p_envio::text || '.webp')
  on conflict(envio_id) do nothing;
  select * into operacao from renata_privado.cadastro_fotos where envio_id = p_envio for update;
  -- Outra requisição pode ter concluído o mesmo envio enquanto o lock era aguardado.
  select envio_hash into hash_atual from public.adv_clientes where envio_id = p_envio;
  if found then
    if hash_atual <> p_hash then raise exception 'Envio alterado' using errcode='22023'; end if;
    return jsonb_build_object('concluida',true);
  end if;
  if operacao.envio_hash <> p_hash then raise exception 'Envio alterado' using errcode='22023'; end if;
  if operacao.expira_em <= clock_timestamp() then raise exception 'Envio expirado' using errcode='40001'; end if;
  insert into renata_privado.storage_limpezas(foto_path,disponivel_em)
  values(operacao.foto_path,operacao.expira_em) on conflict(foto_path) do nothing;
  return jsonb_build_object('concluida',false,'path',operacao.foto_path);
end $$;

create function public.adv_registrar_cliente_com_foto(p_dados jsonb,p_envio uuid,p_hash text) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare operacao renata_privado.cadastro_fotos;
declare hash_atual text;
declare tarefa renata_privado.storage_limpezas;
begin
  select envio_hash into hash_atual from public.adv_clientes where envio_id = p_envio;
  if found then return coalesce(hash_atual = p_hash,false); end if;
  select * into operacao from renata_privado.cadastro_fotos where envio_id = p_envio for update;
  if not found or operacao.envio_hash is distinct from p_hash then raise exception 'Envio inválido' using errcode='22023'; end if;
  select envio_hash into hash_atual from public.adv_clientes where envio_id = p_envio;
  if found then return coalesce(hash_atual = p_hash,false); end if;
  select * into tarefa from renata_privado.storage_limpezas where foto_path = operacao.foto_path for update;
  if not found or tarefa.token is not null or operacao.expira_em <= clock_timestamp() then
    raise exception 'Envio expirado' using errcode='40001';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='fotos-clientes' and name=operacao.foto_path) then
    raise exception 'Fotografia não recebida' using errcode='P0002';
  end if;
  insert into public.adv_clientes (
    id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,tipo_caso,
    caso_juridico,andamento_caso,foto_path,status,criado_em,envio_id,envio_hash
  ) values (
    operacao.cliente_id,p_dados->>'nome',nullif(p_dados->>'nome_social',''),p_dados->>'endereco',
    nullif(p_dados->>'rg',''),nullif(p_dados->>'cpf',''),p_dados->>'filiacao',p_dados->>'nacionalidade',
    p_dados->>'cidade_nascimento',p_dados->>'tipo_caso',p_dados->>'caso_juridico',nullif(p_dados->>'andamento_caso',''),
    operacao.foto_path,'novo',now(),p_envio,p_hash
  ) on conflict(envio_id) do nothing;
  select envio_hash into hash_atual from public.adv_clientes where envio_id=p_envio;
  if hash_atual is distinct from p_hash then return false; end if;
  if not exists(select 1 from public.adv_clientes where id=operacao.cliente_id and envio_id=p_envio) then
    raise exception 'Conflito no cadastro recebido' using errcode='22023';
  end if;
  update renata_privado.cadastro_fotos set cliente_vinculado=operacao.cliente_id where envio_id=p_envio;
  delete from renata_privado.storage_limpezas where foto_path=operacao.foto_path;
  return true;
end $$;
revoke all on function public.adv_cadastro_foto_preparar(uuid,text),public.adv_registrar_cliente_com_foto(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.adv_cadastro_foto_preparar(uuid,text),public.adv_registrar_cliente_com_foto(jsonb,uuid,text) to service_role;

-- O restante atualiza cadastro, auditoria e descarte de metadados resolvidos.

create or replace function public.adv_registrar_cliente(p_dados jsonb, p_envio uuid, p_hash text) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare hash_existente text;
begin
  if p_envio is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.adv_clientes (
    id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico,andamento_caso,status,criado_em,envio_id,envio_hash
  ) values (
    gen_random_uuid(), p_dados ->> 'nome', nullif(p_dados ->> 'nome_social',''), p_dados ->> 'endereco',
    nullif(p_dados ->> 'rg',''), nullif(p_dados ->> 'cpf',''), p_dados ->> 'filiacao', p_dados ->> 'nacionalidade',
    p_dados ->> 'cidade_nascimento', p_dados ->> 'tipo_caso', p_dados ->> 'caso_juridico', nullif(p_dados ->> 'andamento_caso',''), 'novo', now(), p_envio, p_hash
  ) on conflict (envio_id) do nothing;
  if found then return true; end if;
  select envio_hash into hash_existente from public.adv_clientes where envio_id = p_envio;
  return coalesce(hash_existente = p_hash, false);
end $$;

-- CREATE OR REPLACE conserva ACLs: reafirme a restrição do cadastro sem foto.
revoke all on function public.adv_registrar_cliente(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.adv_registrar_cliente(jsonb,uuid,text) to service_role;

create or replace function renata_privado.auditar() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare autor uuid;
declare nome_autor text;
declare evento text;
declare cliente uuid;
declare metadados jsonb := '{}'::jsonb;
declare campos text[];
begin
  if tg_table_name = 'adv_observacoes' then
    evento := 'observacao';
    cliente := new.cliente_id;
    autor := new.advogado_id;
    nome_autor := new.advogado_nome;
  elsif tg_op = 'INSERT' then
    evento := 'cadastro';
    cliente := new.id;
  else
    cliente := new.id;
    select a.id, a.nome into autor, nome_autor from public.adv_advogados a where a.auth_user_id = auth.uid();
    if new.arquivado_em is distinct from old.arquivado_em then
      evento := case when new.arquivado_em is null then 'restauracao' else 'arquivamento' end;
    elsif new.foto_path is distinct from old.foto_path then
      evento := case when new.foto_path is null then 'foto_removida'
                     when old.foto_path is null then 'foto_adicionada' else 'foto_atualizada' end;
    else
      evento := 'atualizacao';
      select array_agg(k order by k) into campos
      from unnest(array['nome','nome_social','endereco','rg','cpf','filiacao','nacionalidade','cidade_nascimento','tipo_caso','caso_juridico','andamento_caso','status']) as chave(k)
      where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
      if campos is null then return new; end if;
      metadados := jsonb_build_object('campos', campos);
      if new.status is distinct from old.status then
        metadados := metadados || jsonb_build_object('status_anterior', old.status, 'status_novo', new.status);
      end if;
    end if;
  end if;
  insert into public.adv_auditoria (id,cliente_id,advogado_id,advogado_nome,acao,detalhes,criado_em)
  values (gen_random_uuid(),cliente,autor,nome_autor,evento,metadados,now());
  return new;
end $$;

-- Apenas metadados de reservas expiradas. Não exclui clientes ou objetos do Storage.
revoke all on function renata_privado.auditar() from public,anon,authenticated;
create function public.adv_cadastro_fotos_limpar() returns integer
language plpgsql security invoker set search_path = ''
as $$
declare removidos integer;
begin
  delete from renata_privado.cadastro_fotos c where c.expira_em < now() - interval '1 day'
    and not exists(select 1 from renata_privado.storage_limpezas l where l.foto_path = c.foto_path and l.concluida_em is null);
  get diagnostics removidos = row_count;
  return removidos;
end $$;
revoke all on function public.adv_cadastro_fotos_limpar() from public,anon,authenticated;
grant execute on function public.adv_cadastro_fotos_limpar() to service_role;

notify pgrst, 'reload schema';
commit;
