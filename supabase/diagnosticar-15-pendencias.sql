-- Diagnóstico das 15 pendências, antes da migração. Projeto srvzdpkaqnxvydxinfco.
-- EXECUTE O ARQUIVO INTEIRO: um único SELECT e uma tabela de 15 resultados.
-- Somente catálogos/configuração. Não lê cadastros nem executa funções da aplicação.
-- Mostra ACL efetiva, origens e definições SQL de funções/políticas; não modifica nada.
-- As pistas de falso positivo são para revisão, não autorizam merge, deploy ou DDL.
with
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
alvos_acl as (
  select a.* from acls a where a.assinatura in (
    'public.adv_cliente_arquivar(uuid, integer, boolean)',
    'public.adv_cliente_excluir(uuid, integer, uuid)',
    'public.adv_cliente_exclusao_estado(uuid)',
    'public.adv_cliente_pode_excluir(uuid)',
    'public.adv_foto_concluir(uuid)',
    'public.adv_foto_preparar(uuid, integer, uuid, text)',
    'public.adv_foto_remover(uuid, integer)',
    'public.adv_listar_clientes(text, text, date, date)',
    'public.adv_listar_clientes_v2(text, text, date, date, boolean)',
    'public.adv_totais_clientes()', 'public.adv_totais_clientes_v2(boolean)'
  )
),
alvos_rls as (
  select p.*,case when p.nome='renata_restringir_observacoes_insercao'
    then array['public.adv_advogados'] else array['public.adv_clientes'] end as referencias_esperadas
  from politicas p where p.nome in ('renata_auditoria_cliente_visivel','renata_observacao_cliente_visivel','renata_restringir_observacoes_insercao')
),
funcoes_reais as (
  select a.*,p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.pronamespace,
    coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_real,
    coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_real,
    coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) as servico_real,
    (select count(*)=2 and bool_and(not r.rolsuper and not r.rolbypassrls and not pg_has_role(r.oid,'service_role','MEMBER') and (p.oid is null or not pg_has_role(r.oid,p.proowner,'USAGE')))
      from pg_roles r where r.rolname in ('anon','authenticated')) as papeis_navegador_seguros
  from alvos_acl a left join pg_proc p on p.oid=to_regprocedure(a.assinatura)
),
politicas_reais as (
  select e.*,x.oid,x.polpermissive,x.polcmd,c.relrowsecurity,
    coalesce(pg_get_expr(x.polqual,x.polrelid),'') as expressao_real,
    coalesce(pg_get_expr(x.polwithcheck,x.polrelid),'') as checagem_real,
    coalesce((select array_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r)::text end order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r)::text end) from unnest(x.polroles) r),array[]::text[]) as papeis_reais,
    coalesce((select array_agg(distinct n.nspname||'.'||r.relname order by n.nspname||'.'||r.relname)
      from pg_depend d join pg_class r on r.oid=d.refobjid join pg_namespace n on n.oid=r.relnamespace
      where d.classid='pg_catalog.pg_policy'::regclass and d.objid=x.oid
        and d.refclassid='pg_catalog.pg_class'::regclass and d.refobjid<>x.polrelid),array[]::text[]) as referencias_reais,
    case when x.oid is null then null else jsonb_build_object(
      'using_pretty',pg_get_expr(x.polqual,x.polrelid,true),
      'with_check_pretty',pg_get_expr(x.polwithcheck,x.polrelid,true)) end as outras_representacoes
  from alvos_rls e left join pg_class c on c.oid=to_regclass(e.tabela)
    left join pg_policy x on x.polrelid=c.oid and x.polname=e.nome
),
comparacoes_rls as (
  select p.*,
    p.oid is not null and p.relrowsecurity and not p.polpermissive and p.polcmd::text=p.comando
      and p.papeis_reais=string_to_array(p.papeis,',') and p.referencias_reais=p.referencias_esperadas as estrutura_ok,
    p.expressao=p.expressao_real and p.checagem=p.checagem_real as texto_identico,
    -- PISTA de apresentação, nunca autorização automática. Não remove parênteses,
    -- operadores, casts ou condições. Compare os textos completos antes de aprovar.
    btrim(regexp_replace(replace(replace(p.expressao_real,'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g'))
      =btrim(regexp_replace(p.expressao,'[[:space:]]+',' ','g'))
    and btrim(regexp_replace(replace(replace(p.checagem_real,'public.adv_clientes','adv_clientes'),'public.adv_advogados','adv_advogados'),'[[:space:]]+',' ','g'))
      =btrim(regexp_replace(p.checagem,'[[:space:]]+',' ','g')) as pista_formato
  from politicas_reais p
),
relatorio as (
  select 'ACL_FUNCAO'::text as categoria,f.assinatura as item,
    case when f.oid is null then 'FUNCAO_AUSENTE'
      when f.anon_real<>f.anon or f.authenticated_real<>f.authenticated or f.prosecdef or not f.papeis_navegador_seguros then 'DIVERGENCIA_RELEVANTE'
      when f.servico_real<>f.servico then 'POSSIVEL_FALSO_POSITIVO_SERVICE_ROLE'
      else 'COINCIDE_COM_ESPERADO_ANTERIOR' end as avaliacao,
    jsonb_build_object('inspecao_anterior',jsonb_build_object('anon_execute',f.anon,'authenticated_execute',f.authenticated,'service_role_execute',f.servico),
      'regra_de_seguranca',jsonb_build_object('anon_execute',false,'authenticated_execute',true,'security_definer',false,
      'service_role_execute','Não é necessário exigir ausência de EXECUTE do papel confiável do backend nestas RPCs invoker. Não concede novos privilégios.'),
      'escopo_da_avaliacao','Classifica estas pendências de ACL; não aprova automaticamente o corpo completo da função. Compare a definição retornada com as migrações do repositório.') as esperado,
    jsonb_build_object('existe',f.oid is not null,'papeis_navegador_seguros',f.papeis_navegador_seguros,'proprietario',pg_get_userbyid(f.proowner),'security_definer',f.prosecdef,
      'search_path_e_config',f.proconfig,'definicao',pg_get_functiondef(f.oid),'acl_armazenada',f.proacl,
      'acl_nula_usa_default',f.proacl is null,
      'execute_efetivo',jsonb_build_object('anon',f.anon_real,'authenticated',f.authenticated_real,'service_role',f.servico_real),
      'origens_por_papel',(select jsonb_object_agg(r.rolname,jsonb_build_object(
        'superuser',r.rolsuper,'bypassrls_nao_substitui_execute',r.rolbypassrls,'inherit',r.rolinherit,
        'proprietario_ou_herda_proprietario',case when f.oid is null then false else pg_has_role(r.oid,f.proowner,'USAGE') end,
        'grant_acl_direto_ou_default',exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) z where z.grantee=r.oid and z.privilege_type='EXECUTE'),
        'grant_via_public',exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) z where z.grantee=0 and z.privilege_type='EXECUTE'),
        'papeis_herdados_com_execute',coalesce((select jsonb_agg(jsonb_build_object('papel',pg_get_userbyid(z.grantee),'grantor',pg_get_userbyid(z.grantor),'grantable',z.is_grantable))
          from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) z where z.grantee<>0 and z.grantee<>r.oid and z.privilege_type='EXECUTE' and pg_has_role(r.oid,z.grantee,'USAGE')),'[]'::jsonb),
        'membro_direto_de',coalesce((select jsonb_agg(pg_get_userbyid(m.roleid)) from pg_auth_members m where m.member=r.oid),'[]'::jsonb)
      )) from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
      'defaults_atuais_nao_provam_origem_historica',coalesce((select jsonb_agg(jsonb_build_object(
        'criador',pg_get_userbyid(d.defaclrole),'schema',case when d.defaclnamespace=0 then '(global)' else n.nspname end,
        'grantee',case when z.grantee=0 then 'PUBLIC' else pg_get_userbyid(z.grantee) end,'privilegio',z.privilege_type))
        from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
        cross join lateral aclexplode(d.defaclacl) z
        where d.defaclobjtype='f' and d.defaclrole=f.proowner and d.defaclnamespace in (0,f.pronamespace)),'[]'::jsonb)
    ) as encontrado
  from funcoes_reais f
  union all
  select 'POLITICA_RLS',p.tabela||'.'||p.nome,
    case when p.oid is null then 'POLITICA_AUSENTE'
      when not p.estrutura_ok then 'ESTRUTURA_OU_DEPENDENCIA_DIFERENTE'
      when p.texto_identico then 'COINCIDE_COM_ESPERADO_ANTERIOR'
      when p.pista_formato then 'POSSIVEL_FALSO_POSITIVO_REPRESENTACAO'
      else 'DEFINICAO_DIFERENTE_REVISAR' end,
    jsonb_build_object('rls_habilitado',true,'permissive',false,'comando',p.comando,'papeis',string_to_array(p.papeis,','),
      'using',p.expressao,'with_check',p.checagem,'outras_tabelas_referenciadas',p.referencias_esperadas),
    jsonb_build_object('existe',p.oid is not null,'rls_habilitado',p.relrowsecurity,'permissive',p.polpermissive,'comando',p.polcmd,
      'papeis',p.papeis_reais,'using',p.expressao_real,'with_check',p.checagem_real,
      'outras_tabelas_referenciadas',p.referencias_reais,'texto_identico',p.texto_identico,
      'estrutura_e_dependencias_ok',p.estrutura_ok,'pista_apenas_representacao',p.pista_formato,
      'outras_representacoes',p.outras_representacoes,
      'instrucao','Pista textual não aprova política diferente. Não trocar políticas com base apenas nessa indicação.')
  from comparacoes_rls p
  union all
  select 'DATA_API','schema_privado_na_data_api',
    case when nullif(btrim(current_setting('pgrst.db_schemas',true)),'') is null then 'CONFERENCIA_MANUAL_NO_PAINEL'
      when exists(select 1 from regexp_split_to_table(current_setting('pgrst.db_schemas',true),'[[:space:]]*,[[:space:]]*') s(nome) where btrim(s.nome,' "')='renata_privado') then 'PARAMETRO_LISTA_SCHEMA_PRIVADO_REVISAR'
      else 'PARAMETRO_NAO_LISTA_PRIVADO_CONFERIR_PAINEL' end,
    jsonb_build_object('schema_que_nao_deve_ser_exposto','renata_privado'),
    jsonb_build_object('parametro_na_sessao_sql',current_setting('pgrst.db_schemas',true),
      'url_painel','https://supabase.com/dashboard/project/srvzdpkaqnxvydxinfco/integrations/data_api/settings',
      'caminho','Projeto > Integrations > Data API > Settings > Exposed schemas',
      'observacao','O parâmetro da sessão SQL não confirma sozinho a configuração do processo PostgREST. Ausência do parâmetro não significa schema exposto.')
)
select categoria,item,avaliacao,esperado,encontrado from relatorio order by categoria,item;
