-- PÓS-MIGRAÇÃO 20261108183508: srvzdpkaqnxvydxinfco. Execute TODO este arquivo.
-- Um único SELECT, somente leitura; saída única item, ok, detalhe, apenas pendências.
-- Não reaplica migrações, não lê cadastros/contas/fotografias nem chama RPCs da aplicação.
-- Catálogos e configuração do bucket apenas. Zero linhas = nenhuma pendência detectada.
-- Hashes normalizam somente CRLF/LF. RLS mantém a comparação por estrutura e dependências.
-- Finalizador e exclusão são comparados com as definições da migração ANTERIOR versionada.
-- Isto verifica compatibilidade atual, não prova retrospectivamente proprietário/ACL idênticos
-- nem preservação de dados sem um retrato anterior. Não faça testes destrutivos para conferir.
-- A Data API usa a conferência manual já confirmada pelo responsável quando o parâmetro
-- não está disponível no SQL Editor. Não representa descoberta automática pelo banco.
with
-- Conferência manual já informada pelo responsável nesta conversa.
-- Não é descoberta pelo SQL. Use false se a configuração do painel tiver mudado.
confirmacao_manual(data_api_sem_schema_privado) as (values (true)),
relacoes(nome) as (values ('renata_privado.cadastro_fotos'), ('public.adv_clientes'),
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
colunas(tabela,coluna,tipo) as (values
('public.adv_clientes','andamento_caso','text'),
('renata_privado.cadastro_fotos','envio_id','uuid'),
('renata_privado.cadastro_fotos','cliente_id','uuid'),
('renata_privado.cadastro_fotos','cliente_vinculado','uuid'),
('renata_privado.cadastro_fotos','envio_hash','text'),
('renata_privado.cadastro_fotos','foto_path','text'),
('renata_privado.cadastro_fotos','expira_em','timestamp with time zone'), ('auth.sessions','id','uuid'),
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
funcoes(assinatura,definer,resultado,hash_esperado) as (values ('public.adv_cadastro_fotos_limpar()',false,'integer','dcdf67867030c168b051273661b1742f'),
 ('public.adv_registrar_cliente_com_foto(jsonb, uuid, text)',false,'boolean','375e84b25f467b683763d85e2efdd4bb'),
 ('public.adv_cadastro_foto_preparar(uuid, text)',false,'jsonb','751339e04e2c7803a8a325b4eefbe789'),
 ('public.adv_cliente_arquivar(uuid, integer, boolean)',false,'void',null::text),
('public.adv_cliente_excluir(uuid, integer, uuid)',false,'uuid','d8d101a90e915c0552e2970c0a492592'),
('public.adv_cliente_exclusao_estado(uuid)',false,'text',null::text),
('public.adv_cliente_pode_excluir(uuid)',false,'boolean',null::text),
('public.adv_foto_concluir(uuid)',false,'void',null::text),
('public.adv_foto_preparar(uuid, integer, uuid, text)',false,'jsonb',null::text),
('public.adv_foto_remover(uuid, integer)',false,'void',null::text),
('public.adv_limitar_tentativas(text, integer, integer)',false,'boolean',null::text),
('public.adv_listar_clientes(text, text, date, date)',false,'TABLE(id uuid, nome text, criado_em timestamp with time zone, status text)',null::text),
('public.adv_listar_clientes_v2(text, text, date, date, boolean)',false,'TABLE(id uuid, nome text, criado_em timestamp with time zone, status text, tipo_caso text, arquivado_em timestamp with time zone, tem_foto boolean)',null::text),
('public.adv_registrar_cliente(jsonb, uuid, text)',false,'boolean','695348d6e02193e176ae6bc5435e3201'),
('public.adv_storage_concluir(uuid[], uuid[])',false,'void',null::text),
('public.adv_storage_finalizar_exclusoes(uuid)',false,'integer','dae7a6bb8c5d545002b7526d78bc6caf'),
('public.adv_storage_pendentes(uuid)',false,'bigint',null::text),
('public.adv_storage_recolher(uuid)',false,'TABLE(id uuid, foto_path text, token uuid)',null::text),
('public.adv_totais_clientes()',false,'json',null::text),
('public.adv_totais_clientes_v2(boolean)',false,'json',null::text),
('renata_privado.arquivar(uuid, integer, boolean)',true,'void',null::text),
('renata_privado.auditar()',true,'trigger','9a448a4d837c697b4439b8a807ea154d'),
('renata_privado.cliente_para_alterar(uuid, integer)',true,'adv_clientes',null::text),
('renata_privado.cliente_validar()',true,'trigger','ee704fae6debdb408cd17ad35e83d390'),
('renata_privado.cpf_valido(text)',false,'boolean',null::text),
('renata_privado.excluir(uuid, integer, uuid)',true,'uuid','5f49524bcafeeada31fd2ccf3acb96e1'),
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
acls(assinatura,anon,authenticated,servico) as (values
('public.adv_cadastro_foto_preparar(uuid, text)',false,false,true),
('public.adv_registrar_cliente_com_foto(jsonb, uuid, text)',false,false,true),
('public.adv_cadastro_fotos_limpar()',false,false,true), ('public.adv_cliente_arquivar(uuid, integer, boolean)',false,true,null::boolean),
('public.adv_cliente_excluir(uuid, integer, uuid)',false,true,null::boolean),
('public.adv_cliente_exclusao_estado(uuid)',false,true,null::boolean),
('public.adv_cliente_pode_excluir(uuid)',false,true,null::boolean),
('public.adv_foto_concluir(uuid)',false,true,null::boolean),
('public.adv_foto_preparar(uuid, integer, uuid, text)',false,true,null::boolean),
('public.adv_foto_remover(uuid, integer)',false,true,null::boolean),
('public.adv_limitar_tentativas(text, integer, integer)',false,false,true),
('public.adv_listar_clientes(text, text, date, date)',false,true,null::boolean),
('public.adv_listar_clientes_v2(text, text, date, date, boolean)',false,true,null::boolean),
('public.adv_registrar_cliente(jsonb, uuid, text)',false,false,true),
('public.adv_storage_concluir(uuid[], uuid[])',false,false,true),
('public.adv_storage_finalizar_exclusoes(uuid)',false,false,true),
('public.adv_storage_pendentes(uuid)',false,false,true),
('public.adv_storage_recolher(uuid)',false,false,true),
('public.adv_totais_clientes()',false,true,null::boolean),
('public.adv_totais_clientes_v2(boolean)',false,true,null::boolean),
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
 select 'tabela:'||r.nome as item, c.oid is not null as ok, 'A dependência deve existir após a migração.' as detalhe
 from relacoes r left join pg_class c on c.oid=to_regclass(r.nome)
 union all
 select 'coluna:'||c.tabela||'.'||c.coluna, exists(select 1 from pg_attribute a where a.attrelid=to_regclass(c.tabela) and a.attname=c.coluna and a.attnum>0 and not a.attisdropped and a.atttypid=to_regtype(c.tipo)), 'Tipo esperado: '||c.tipo from colunas c
 union all
 select 'funcao:'||f.assinatura, exists(select 1 from pg_proc p where p.oid=to_regprocedure(f.assinatura) and p.prokind='f' and p.prosecdef=f.definer and (not f.definer or ('search_path=""'=any(p.proconfig) and not pg_has_role('anon',p.proowner,'USAGE') and not pg_has_role('authenticated',p.proowner,'USAGE'))) and (pg_get_function_result(p.oid)=f.resultado or (f.resultado='adv_clientes' and p.prorettype=to_regtype('public.adv_clientes') and not p.proretset)) and (f.hash_esperado is null or md5(replace(p.prosrc,chr(13),''))=f.hash_esperado)),
   'Assinatura/segurança/retorno' || case when f.hash_esperado is null then '.' else '; hash esperado '||f.hash_esperado||', atual '||coalesce((select md5(replace(p.prosrc,chr(13),'')) from pg_proc p where p.oid=to_regprocedure(f.assinatura)),'ausente') end from funcoes f
 union all
 select 'politica:'||p.tabela||'.'||p.nome, exists(select 1 from pg_policy x where x.polrelid=to_regclass(p.tabela) and x.polname=p.nome and not x.polpermissive and x.polcmd::text=p.comando
   and (select string_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end,',' order by r) from unnest(x.polroles) r)=p.papeis
   and (
     (coalesce(pg_get_expr(x.polqual,x.polrelid),'')=p.expressao and coalesce(pg_get_expr(x.polwithcheck,x.polrelid),'')=p.checagem)
     or (p.nome in ('renata_auditoria_cliente_visivel','renata_observacao_cliente_visivel','renata_restringir_observacoes_insercao')
       and btrim(regexp_replace(replace(replace(coalesce(pg_get_expr(x.polqual,x.polrelid),''),'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g'))=btrim(regexp_replace(replace(replace(p.expressao,'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g'))
       and btrim(regexp_replace(replace(replace(coalesce(pg_get_expr(x.polwithcheck,x.polrelid),''),'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g'))=btrim(regexp_replace(replace(replace(p.checagem,'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g')))
   )
   -- Nas três políticas com subconsultas, confirme as relações reais por OID.
   -- Não remova parênteses, operadores, casts, literais ou cláusulas da condição.
   and (p.nome not in ('renata_auditoria_cliente_visivel','renata_observacao_cliente_visivel','renata_restringir_observacoes_insercao') or
     coalesce((select array_agg(distinct n.nspname||'.'||r.relname order by n.nspname||'.'||r.relname)
       from pg_depend d join pg_class r on r.oid=d.refobjid join pg_namespace n on n.oid=r.relnamespace
       where d.classid='pg_catalog.pg_policy'::regclass and d.objid=x.oid and d.refclassid='pg_catalog.pg_class'::regclass and d.refobjid<>x.polrelid),array[]::text[])
     =case when p.nome='renata_restringir_observacoes_insercao' then array['public.adv_advogados'] else array['public.adv_clientes'] end)), 'Política restritiva, papéis e expressões esperados.' from politicas p
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
 ('renata_privado.cadastro_fotos','SELECT'),('renata_privado.cadastro_fotos','INSERT'),('renata_privado.cadastro_fotos','UPDATE'),('renata_privado.cadastro_fotos','DELETE'),
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
 select 'andamento_sem_limite_check', not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='andamento_caso' and not a.attisdropped and (a.atttypid<>'pg_catalog.text'::regtype or a.attnotnull or a.attgenerated<>'' or exists(select 1 from pg_constraint k where k.conrelid=a.attrelid and k.contype='c' and a.attnum=any(k.conkey)))), 'Andamento não deve ter CHECK de comprimento, domínio ou geração que limite seu conteúdo.'
 union all
 select 'servico_lock_cliente',has_any_column_privilege('service_role',to_regclass('public.adv_clientes'),'UPDATE'),'SELECT FOR UPDATE do finalizador existente exige UPDATE em pelo menos uma coluna.'
 union all
 select 'acl_funcao:'||f.assinatura,has_function_privilege('anon',to_regprocedure(f.assinatura),'EXECUTE')=f.anon and has_function_privilege('authenticated',to_regprocedure(f.assinatura),'EXECUTE')=f.authenticated and (f.servico is null or has_function_privilege('service_role',to_regprocedure(f.assinatura),'EXECUTE')=f.servico),'Anon/authenticated devem corresponder ao esperado. Service_role opcional somente nas 11 RPCs públicas invoker; isso não altera grants.' from acls f
 union all
 select 'rpc_servico:'||f.assinatura, has_function_privilege('service_role',to_regprocedure(f.assinatura),'EXECUTE') and not has_function_privilege('anon',to_regprocedure(f.assinatura),'EXECUTE') and not has_function_privilege('authenticated',to_regprocedure(f.assinatura),'EXECUTE'), 'RPC deve ser exclusiva de service_role.' from funcoes f where f.assinatura like 'public.adv_cadastro_%' or f.assinatura like 'public.adv_registrar_cliente_com_foto(%' or f.assinatura like 'public.adv_storage_%' or f.assinatura like 'public.adv_registrar_cliente(%' or f.assinatura like 'public.adv_limitar_tentativas(%'
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
 select 'schema_privado_na_data_api',
   case when nullif(btrim(current_setting('pgrst.db_schemas',true)),'') is null then
     (select data_api_sem_schema_privado from confirmacao_manual)
   else not exists(select 1 from regexp_split_to_table(current_setting('pgrst.db_schemas',true),'[[:space:]]*,[[:space:]]*') s(nome) where btrim(s.nome,' "')='renata_privado') end,
   'Ausência do parâmetro usa SOMENTE a conferência manual já informada. Caso tenha mudado, confira Integrations > Data API > Settings > Exposed schemas. Não exponha renata_privado.'
),
checagens_novas as (
 select 'andamento_text_null_sem_default' as item,exists(select 1 from pg_attribute a
   where a.attrelid=to_regclass('public.adv_clientes') and a.attname='andamento_caso'
     and a.attnum>0 and not a.attisdropped and a.atttypid='pg_catalog.text'::regtype
     and not a.attnotnull and not a.atthasdef and a.attgenerated='' and a.attidentity='') as ok,
   'andamento_caso deve existir como TEXT NULL, sem geração ou default.' as detalhe
 union all
 select 'andamento_privilegio:'||r.papel||':'||v.privilegio,
   coalesce((select has_column_privilege(r.papel,a.attrelid,a.attnum,v.privilegio)=r.permitido
     from pg_attribute a where a.attrelid=to_regclass('public.adv_clientes') and a.attname='andamento_caso' and not a.attisdropped),false),
   'Permissão efetiva esperada: '||r.permitido::text||'. authenticated continua sujeito às políticas restritivas de leitura/gestão.'
 from (values('anon',false),('authenticated',true)) r(papel,permitido)
 cross join (values('SELECT'),('UPDATE')) v(privilegio)
 union all
 select 'rpc_cadastro_config:'||v.assinatura,exists(select 1 from pg_proc p where p.oid=to_regprocedure(v.assinatura)
   and not p.prosecdef and p.prokind='f' and 'search_path=""'=any(p.proconfig)
   and p.proargnames is not distinct from v.argumentos and p.pronargdefaults=0),
   'SECURITY INVOKER, search_path vazio e nomes dos argumentos compatíveis com as chamadas do servidor.'
 from (values
 ('public.adv_registrar_cliente(jsonb,uuid,text)',array['p_dados','p_envio','p_hash']),
 ('public.adv_registrar_cliente_com_foto(jsonb,uuid,text)',array['p_dados','p_envio','p_hash']),
 ('public.adv_cadastro_foto_preparar(uuid,text)',array['p_envio','p_hash']),
 ('public.adv_cadastro_fotos_limpar()',null::text[])) v(assinatura,argumentos)
 union all
 select 'cadastro_fotos_sem_gatilhos_extras',not exists(select 1 from pg_trigger where tgrelid=to_regclass('renata_privado.cadastro_fotos') and not tgisinternal),
   'A migração não cria gatilhos de aplicação na tabela de reservas.'
 union all
 select 'cadastro_fotos_indice:'||v.nome,exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
   join pg_attribute a on a.attrelid=i.indrelid and a.attname=v.coluna and not a.attisdropped
   where i.indrelid=to_regclass('renata_privado.cadastro_fotos') and c.relname=v.nome
     and i.indisvalid and i.indisready and i.indnkeyatts=1 and i.indkey[0]=a.attnum and i.indexprs is null
     and coalesce(pg_get_expr(i.indpred,i.indrelid),'')=v.predicado),
   'Índice necessário para localizar reservas por cliente/vínculo sem varredura completa.'
 from (values('renata_cadastro_fotos_cliente','cliente_id',''),
 ('renata_cadastro_fotos_vinculo','cliente_vinculado','(cliente_vinculado IS NOT NULL)')) v(nome,coluna,predicado)
 union all
 select 'cadastro_fotos_sem_politicas_navegador',not exists(select 1 from pg_policy where polrelid=to_regclass('renata_privado.cadastro_fotos')),
   'Reservas privadas usam service_role com BYPASSRLS; nenhuma política de acesso pelo navegador foi criada pela migração.'
 union all
 select 'cadastro_fotos_nulabilidade:'||v.coluna,exists(select 1 from pg_attribute a where a.attrelid=to_regclass('renata_privado.cadastro_fotos') and a.attname=v.coluna and a.attnum>0 and not a.attisdropped and a.attnotnull=v.obrigatoria),
   'NOT NULL esperado: '||v.obrigatoria::text
 from (values('envio_id',true),('cliente_id',true),('cliente_vinculado',false),('envio_hash',true),('foto_path',true),('expira_em',true)) v(coluna,obrigatoria)
 union all
 select 'cadastro_fotos_fk_cliente',exists(select 1 from pg_constraint c
   where c.conrelid=to_regclass('renata_privado.cadastro_fotos') and c.contype='f' and c.convalidated and not c.condeferrable
     and c.confrelid=to_regclass('public.adv_clientes') and c.confdeltype='c' and c.confupdtype='a'
     and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='cliente_vinculado' and not attisdropped)]::smallint[]
     and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id' and not attisdropped)]::smallint[]),
   'FK validada cliente_vinculado -> adv_clientes.id, ON DELETE CASCADE somente do cliente para a reserva.'
 union all
 select 'cadastro_fotos_sem_fk_inversa',not exists(select 1 from pg_constraint where contype='f' and conrelid=to_regclass('public.adv_clientes') and confrelid=to_regclass('renata_privado.cadastro_fotos')),
   'Nenhuma FK de clientes para reservas deve permitir exclusão em sentido inverso.'
 union all
 select 'cadastro_fotos_chave_primaria',exists(select 1 from pg_constraint c where c.conrelid=to_regclass('renata_privado.cadastro_fotos') and c.contype='p' and c.convalidated
   and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='envio_id' and not attisdropped)]::smallint[]),
   'envio_id deve ser a chave primária das reservas.'
 union all
 select 'cadastro_fotos_foto_unica',exists(select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attname='foto_path'
   where i.indrelid=to_regclass('renata_privado.cadastro_fotos') and i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null and i.indexprs is null and i.indnkeyatts=1 and i.indkey[0]=a.attnum),
   'foto_path deve ter unicidade imediata sem filtro.'
 union all
 select 'cadastro_fotos_check:'||v.nome,exists(select 1 from pg_constraint c where c.conrelid=to_regclass('renata_privado.cadastro_fotos') and c.contype='c' and c.convalidated and c.conname=v.nome and pg_get_expr(c.conbin,c.conrelid)=v.expressao),
   'CHECK validado esperado: '||v.expressao from (values ('cadastro_fotos_check','((cliente_vinculado IS NULL) OR (cliente_vinculado = cliente_id))'),
('cadastro_fotos_envio_hash_check','(envio_hash ~ ''^[0-9a-f]{64}$''::text)')) v(nome,expressao)
 union all
 select 'cadastro_fotos_default:'||v.coluna,exists(select 1 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
   where d.adrelid=to_regclass('renata_privado.cadastro_fotos') and a.attname=v.coluna and pg_get_expr(d.adbin,d.adrelid)=v.expressao),
   'Default esperado: '||v.expressao from (values ('cliente_id','gen_random_uuid()'),
('expira_em','(now() + ''00:05:00''::interval)')) v(coluna,expressao)
 union all
 select 'finalizador_proprietario_seguro',exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.adv_storage_finalizar_exclusoes(uuid)')
   and not pg_has_role('anon',p.proowner,'USAGE') and not pg_has_role('authenticated',p.proowner,'USAGE')),
   'Proprietário não pode ser assumido por anon/authenticated. Estado atual: '||coalesce((select jsonb_build_object('proprietario',pg_get_userbyid(p.proowner),'body_md5',md5(replace(p.prosrc,chr(13),'')),'acl',p.proacl)::text from pg_proc p where p.oid=to_regprocedure('public.adv_storage_finalizar_exclusoes(uuid)')),'função ausente')
 union all
 select 'finalizador_argumento_e_config',exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.adv_storage_finalizar_exclusoes(uuid)')
   and p.proargnames=array['p_cliente']::text[] and p.pronargdefaults=1
   and pg_get_expr(p.proargdefaults,0)='NULL::uuid' and 'search_path=""'=any(p.proconfig)),
   'Assinatura existente preservada: p_cliente uuid DEFAULT NULL; search_path vazio.'
),
verificacoes as (
 select item,coalesce(ok,false) as ok,detalhe from checagens
 union all
 select item,coalesce(ok,false) as ok,detalhe from checagens_novas
)
select item,ok,detalhe from verificacoes where ok=false order by item;
