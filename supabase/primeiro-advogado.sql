-- Execute no SQL Editor do projeto srvzdpkaqnxvydxinfco, com acesso administrativo.
-- Antes, crie/confirme a conta em Authentication > Users e defina a senha ali.
-- Preencha o JSON SOMENTE no SQL Editor. Preserve este arquivo como modelo vazio.
-- O script autoriza uma conta e desativa os demais perfis em adv_advogados.
begin;

lock table public.adv_advogados in share row exclusive mode;

do $procedimento$
declare
  cadastro jsonb := $cadastro$
  {
      "auth_user_id": null,
      "nome": "",
      "oab_numero": "",
      "oab_uf": "",
      "email": ""
  }
  $cadastro$::jsonb;
  usuario_id uuid;
  nome_advogado text := btrim(cadastro ->> 'nome');
  numero_oab text := btrim(cadastro ->> 'oab_numero');
  uf_oab text := upper(btrim(cadastro ->> 'oab_uf'));
  email_informado text := lower(btrim(cadastro ->> 'email'));
  email_auth text;
  confirmado_em timestamptz;
begin
  if to_regprocedure('renata_privado.permissao_atual()') is null then
    raise exception 'A migração de segurança da aplicação deve estar aplicada antes da autorização.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('adv_advogados','adv_clientes','adv_observacoes','adv_auditoria')
      and not c.relrowsecurity
  ) then
    raise exception 'Confira a configuração de RLS antes de autorizar o acesso.';
  end if;
  if cadastro ->> 'auth_user_id' is null
    or coalesce(char_length(nome_advogado), 0) not between 2 and 150
    or coalesce(char_length(numero_oab), 0) not between 1 and 20
    or coalesce(email_informado, '') = ''
    or coalesce(uf_oab, '') not in (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )
    or nome_advogado ~ '[[:cntrl:]]' or numero_oab ~ '[[:cntrl:]]'
    or email_informado ~ '[[:space:][:cntrl:]]'
  then
    raise exception 'Preencha o UUID do Auth, nome, OAB, UF e e-mail no bloco de cadastro.';
  end if;

  usuario_id := (cadastro ->> 'auth_user_id')::uuid;
  select u.email, u.email_confirmed_at into email_auth, confirmado_em
  from auth.users u where u.id = usuario_id
  for share;
  if not found then
    raise exception 'O UUID informado não corresponde a uma conta do Supabase Auth.';
  end if;
  if lower(btrim(email_auth)) is distinct from email_informado then
    raise exception 'O e-mail informado deve corresponder ao e-mail da conta selecionada no Auth.';
  end if;
  if confirmado_em is null then
    raise exception 'Confirme o e-mail da conta pelo procedimento administrativo do Supabase.';
  end if;
  if exists (
    select 1 from public.adv_advogados a
    where a.auth_user_id <> usuario_id and (
      (a.oab_numero = numero_oab and a.oab_uf = uf_oab)
      or lower(btrim(a.email_login)) = email_informado
    )
  ) then
    raise exception 'A OAB ou o e-mail já pertence a outro perfil. Confira os vínculos antes de continuar.';
  end if;

  update public.adv_advogados
  set ativo = false
  where ativo and auth_user_id <> usuario_id;

  insert into public.adv_advogados (auth_user_id, nome, email_login, oab_numero, oab_uf, permissao, ativo)
  values (usuario_id, nome_advogado, email_auth, numero_oab, uf_oab, 'gestao', true)
  on conflict (auth_user_id) do update
  set nome = excluded.nome,
      email_login = excluded.email_login,
      oab_numero = excluded.oab_numero,
      oab_uf = excluded.oab_uf,
      permissao = excluded.permissao,
      ativo = true;

  if (select count(*) from public.adv_advogados where ativo) <> 1 then
    raise exception 'A autorização exige exatamente um perfil ativo.';
  end if;
end
$procedimento$;

commit;

-- O resultado esperado é 1 e true, sem retornar dados pessoais.
select count(*) as advogados_ativos,
       count(*) = 1 and count(*) filter (where permissao = 'gestao') = 1 as acesso_unico_configurado
from public.adv_advogados
where ativo;
