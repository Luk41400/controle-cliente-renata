-- Compare primeiro o esquema de produção com supabase/inspecionar.sql.
-- Esta migração reutiliza as quatro tabelas existentes e falha integralmente se
-- alguma coluna base não estiver disponível com o tipo esperado.
begin;

do $$
declare faltando text;
begin
  with esperado(tabela, coluna, tipos) as (values
    ('adv_advogados','id','uuid'), ('adv_advogados','auth_user_id','uuid'),
    ('adv_advogados','nome','text,varchar'), ('adv_advogados','email_login','text,varchar'),
    ('adv_advogados','oab_numero','text,varchar'), ('adv_advogados','oab_uf','text,varchar,bpchar'),
    ('adv_advogados','ativo','bool'),
    ('adv_clientes','id','uuid'), ('adv_clientes','nome','text,varchar'),
    ('adv_clientes','nome_social','text,varchar'), ('adv_clientes','endereco','text,varchar'),
    ('adv_clientes','rg','text,varchar'), ('adv_clientes','cpf','text,varchar'),
    ('adv_clientes','filiacao','text,varchar'), ('adv_clientes','nacionalidade','text,varchar'),
    ('adv_clientes','cidade_nascimento','text,varchar'), ('adv_clientes','caso_juridico','text,varchar'),
    ('adv_clientes','status','text,varchar'), ('adv_clientes','criado_em','timestamptz'),
    ('adv_clientes','atualizado_em','timestamptz'),
    ('adv_observacoes','id','uuid'), ('adv_observacoes','cliente_id','uuid'),
    ('adv_observacoes','advogado_id','uuid'), ('adv_observacoes','texto','text,varchar'),
    ('adv_observacoes','criado_em','timestamptz'),
    ('adv_auditoria','id','uuid'), ('adv_auditoria','cliente_id','uuid'),
    ('adv_auditoria','advogado_id','uuid'), ('adv_auditoria','acao','text,varchar'),
    ('adv_auditoria','criado_em','timestamptz')
  )
  select string_agg(tabela || '.' || coluna, ', ' order by tabela, coluna) into faltando
  from esperado e
  where not exists (
    select 1 from information_schema.columns c where c.table_schema = 'public'
    and c.table_name = e.tabela and c.column_name = e.coluna
    and c.udt_name = any(string_to_array(e.tipos, ','))
  );
  if faltando is not null then
    raise exception 'Adapte a migração ao esquema existente. Colunas ausentes ou incompatíveis: %', faltando;
  end if;
end
$$;

create schema renata_privado;
revoke all on schema renata_privado from public, anon, authenticated;
grant usage on schema renata_privado to authenticated, service_role;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions, pg_catalog;

alter table public.adv_advogados
  add column permissao text not null default 'consulta' check (permissao in ('consulta','gestao')),
  alter column ativo set default false;
alter table public.adv_clientes
  add column versao integer not null default 0,
  add column envio_id uuid,
  add column envio_hash text;
alter table public.adv_observacoes add column advogado_nome text;
alter table public.adv_auditoria
  alter column advogado_id drop not null,
  add column advogado_nome text,
  add column detalhes jsonb not null default '{}'::jsonb;

-- Identifique também os autores dos registros anteriores, preservando os IDs.
update public.adv_observacoes o set advogado_nome = a.nome
from public.adv_advogados a where a.id = o.advogado_id;
update public.adv_auditoria h set advogado_nome = a.nome
from public.adv_advogados a where a.id = h.advogado_id;

create unique index renata_clientes_envio on public.adv_clientes (envio_id);
create index renata_clientes_busca on public.adv_clientes using gin (nome gin_trgm_ops);
create index renata_clientes_status_data on public.adv_clientes (status, criado_em desc, id);

-- A consulta verifica a sessão e o perfil no banco, inclusive para tokens ainda
-- válidos depois de logout, revogação ou desativação. O schema fica fora da Data API.
create function renata_privado.permissao_atual() returns text
language sql stable security definer set search_path = ''
as $$
  select a.permissao::text
  from public.adv_advogados a
  join auth.sessions s on s.user_id = a.auth_user_id
  where a.auth_user_id = (select auth.uid()) and a.ativo
    and a.permissao in ('consulta', 'gestao')
    and s.id::text = (select auth.jwt() ->> 'session_id')
    and (s.not_after is null or s.not_after > now())
    and s.created_at > now() - interval '7 days'
$$;
revoke all on function renata_privado.permissao_atual() from public, anon, authenticated;
grant execute on function renata_privado.permissao_atual() to authenticated;

do $$
declare tabela text;
declare colunas text;
begin
  foreach tabela in array array['adv_advogados','adv_clientes','adv_observacoes','adv_auditoria']
  loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', tabela);
    select string_agg(quote_ident(column_name), ', ') into colunas from information_schema.columns
    where table_schema = 'public' and table_name = tabela;
    execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', colunas, tabela);
    execute format('create policy renata_sem_acesso_anonimo on public.%I as restrictive for all to anon using (false) with check (false)', tabela);
  end loop;
end
$$;

grant select (id,auth_user_id,nome,oab_numero,oab_uf,permissao,ativo) on public.adv_advogados to authenticated;
grant select (id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico,status,criado_em,versao) on public.adv_clientes to authenticated;
grant update (nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico,status) on public.adv_clientes to authenticated;
grant select (id,cliente_id,advogado_id,advogado_nome,texto,criado_em) on public.adv_observacoes to authenticated;
grant insert (id,cliente_id,advogado_id,texto) on public.adv_observacoes to authenticated;
grant select (id,cliente_id,acao,advogado_nome,criado_em,detalhes) on public.adv_auditoria to authenticated;
grant select (auth_user_id,email_login,oab_numero,oab_uf,ativo) on public.adv_advogados to service_role;
grant select (envio_id,envio_hash), insert on public.adv_clientes to service_role;

create policy renata_perfil on public.adv_advogados for select to authenticated
using (auth_user_id = (select auth.uid()) and (select renata_privado.permissao_atual()) is not null);
create policy renata_restringir_perfil on public.adv_advogados as restrictive for select to authenticated
using (auth_user_id = (select auth.uid()) and (select renata_privado.permissao_atual()) is not null);

create policy renata_clientes_leitura on public.adv_clientes for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);
create policy renata_restringir_clientes_leitura on public.adv_clientes as restrictive for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);
create policy renata_clientes_edicao on public.adv_clientes for update to authenticated
using ((select renata_privado.permissao_atual()) = 'gestao') with check ((select renata_privado.permissao_atual()) = 'gestao');
create policy renata_restringir_clientes_edicao on public.adv_clientes as restrictive for update to authenticated
using ((select renata_privado.permissao_atual()) = 'gestao') with check ((select renata_privado.permissao_atual()) = 'gestao');

create policy renata_observacoes_leitura on public.adv_observacoes for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);
create policy renata_restringir_observacoes_leitura on public.adv_observacoes as restrictive for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);
create policy renata_observacoes_insercao on public.adv_observacoes for insert to authenticated
with check (
  advogado_id = (select a.id from public.adv_advogados a where a.auth_user_id = (select auth.uid()))
  and (select renata_privado.permissao_atual()) = 'gestao'
);
create policy renata_restringir_observacoes_insercao on public.adv_observacoes as restrictive for insert to authenticated
with check (
  advogado_id = (select a.id from public.adv_advogados a where a.auth_user_id = (select auth.uid()))
  and (select renata_privado.permissao_atual()) = 'gestao'
);

create policy renata_auditoria_leitura on public.adv_auditoria for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);
create policy renata_restringir_auditoria_leitura on public.adv_auditoria as restrictive for select to authenticated
using ((select renata_privado.permissao_atual()) is not null);

create function renata_privado.cpf_valido(cpf text) returns boolean
language plpgsql immutable strict set search_path = ''
as $$
declare soma integer;
declare digito integer;
begin
  if cpf !~ '^[0-9]{11}$' or cpf = repeat(left(cpf, 1), 11) then return false; end if;
  for tamanho in 9..10 loop
    soma := 0;
    for i in 1..tamanho loop
      soma := soma + substr(cpf, i, 1)::integer * (tamanho + 2 - i);
    end loop;
    digito := ((soma * 10) % 11) % 10;
    if digito <> substr(cpf, tamanho + 1, 1)::integer then return false; end if;
  end loop;
  return true;
end
$$;

create function renata_privado.cliente_validar() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.cpf is distinct from old.cpf)
      and not coalesce(renata_privado.cpf_valido(new.cpf), false) then
    raise exception 'CPF inválido' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.versao := old.versao + 1;
    new.atualizado_em := now();
  end if;
  return new;
end
$$;
create trigger renata_validar_cliente before insert or update on public.adv_clientes
for each row execute function renata_privado.cliente_validar();

create function renata_privado.observacao_preparar() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select a.nome into new.advogado_nome from public.adv_advogados a where a.id = new.advogado_id;
  new.criado_em := now();
  return new;
end
$$;
create trigger renata_preparar_observacao before insert on public.adv_observacoes
for each row execute function renata_privado.observacao_preparar();

create function renata_privado.auditar() returns trigger
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
    evento := 'atualizacao';
    cliente := new.id;
    select a.id, a.nome into autor, nome_autor from public.adv_advogados a where a.auth_user_id = auth.uid();
    select array_agg(k order by k) into campos
    from unnest(array['nome','nome_social','endereco','rg','cpf','filiacao','nacionalidade','cidade_nascimento','caso_juridico','status']) as chave(k)
    where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);
    if campos is null then return new; end if;
    metadados := jsonb_build_object('campos', campos);
    if new.status is distinct from old.status then
      metadados := metadados || jsonb_build_object('status_anterior', old.status, 'status_novo', new.status);
    end if;
  end if;
  insert into public.adv_auditoria (id, cliente_id, advogado_id, advogado_nome, acao, detalhes, criado_em)
  values (gen_random_uuid(), cliente, autor, nome_autor, evento, metadados, now());
  return new;
end
$$;
create trigger renata_auditar_cliente after insert or update on public.adv_clientes
for each row execute function renata_privado.auditar();
create trigger renata_auditar_observacao after insert on public.adv_observacoes
for each row execute function renata_privado.auditar();

revoke all on function renata_privado.cpf_valido(text), renata_privado.cliente_validar(),
  renata_privado.observacao_preparar(), renata_privado.auditar() from public, anon, authenticated;

create function public.adv_registrar_cliente(p_dados jsonb, p_envio uuid, p_hash text) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare hash_existente text;
begin
  if p_envio is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.adv_clientes (
    id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico,status,criado_em,envio_id,envio_hash
  ) values (
    gen_random_uuid(), p_dados ->> 'nome', nullif(p_dados ->> 'nome_social',''), p_dados ->> 'endereco',
    p_dados ->> 'rg', p_dados ->> 'cpf', p_dados ->> 'filiacao', p_dados ->> 'nacionalidade',
    p_dados ->> 'cidade_nascimento', p_dados ->> 'caso_juridico', 'novo', now(), p_envio, p_hash
  ) on conflict (envio_id) do nothing;
  if found then return true; end if;
  select envio_hash into hash_existente from public.adv_clientes where envio_id = p_envio;
  return coalesce(hash_existente = p_hash, false);
end
$$;
revoke all on function public.adv_registrar_cliente(jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.adv_registrar_cliente(jsonb,uuid,text) to service_role;

create table renata_privado.tentativas (
  chave text primary key,
  ate timestamptz not null,
  total integer not null
);
create index renata_tentativas_expiracao on renata_privado.tentativas (ate);
alter table renata_privado.tentativas enable row level security;
revoke all on renata_privado.tentativas from public, anon, authenticated;
grant select, insert, update, delete on renata_privado.tentativas to service_role;

create function public.adv_limitar_tentativas(p_chave text, p_janela_segundos integer, p_maximo integer) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare instante timestamptz := clock_timestamp();
declare consumido integer;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$'
    or p_janela_segundos is null or p_janela_segundos not between 60 and 3600
    or p_maximo is null or p_maximo not between 1 and 200 then return false;
  end if;
  delete from renata_privado.tentativas where chave in (
    select chave from renata_privado.tentativas where ate <= instante
    order by ate limit 32 for update skip locked
  );
  insert into renata_privado.tentativas as t (chave, ate, total)
  values (p_chave, instante + make_interval(secs => p_janela_segundos), 1)
  on conflict (chave) do update
  set total = case when t.ate <= instante then 1 else t.total + 1 end,
      ate = case when t.ate <= instante then excluded.ate else t.ate end
  where t.ate <= instante or t.total < p_maximo
  returning total into consumido;
  return consumido is not null;
end
$$;
revoke all on function public.adv_limitar_tentativas(text,integer,integer) from public, anon, authenticated;
grant execute on function public.adv_limitar_tentativas(text,integer,integer) to service_role;

create function public.adv_listar_clientes(p_nome text, p_status text, p_inicio date, p_fim date)
returns table (id uuid, nome text, criado_em timestamptz, status text)
language sql stable security invoker
as $$
  select c.id, c.nome::text, c.criado_em, c.status::text from public.adv_clientes c
  where (coalesce(p_nome, '') = '' or c.nome ilike
    '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_nome, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
    and (p_status is null or c.status = p_status)
    and (p_inicio is null or c.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo'))
    and (p_fim is null or c.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'))
$$;
revoke all on function public.adv_listar_clientes(text,text,date,date) from public, anon, authenticated;
grant execute on function public.adv_listar_clientes(text,text,date,date) to authenticated;

create function public.adv_totais_clientes() returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'total', count(*),
    'novos', count(*) filter (where status = 'novo'),
    'andamento', count(*) filter (where status = 'em_andamento'),
    'concluidos', count(*) filter (where status = 'concluido')
  ) from public.adv_clientes
$$;
revoke all on function public.adv_totais_clientes() from public, anon, authenticated;
grant execute on function public.adv_totais_clientes() to authenticated;

commit;
