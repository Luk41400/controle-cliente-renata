-- Revisar e aplicar SOMENTE depois de autorização no projeto srvzdpkaqnxvydxinfco.
-- Pré-requisito: 20261106223752_adv_protecao_e_operacoes.sql.
begin;

do $$
begin
  if to_regprocedure('renata_privado.permissao_atual()') is null then
    raise exception 'Aplique primeiro a migração de segurança de 20261106223752.';
  end if;
end $$;

alter table public.adv_clientes
  alter column rg drop not null,
  alter column cpf drop not null,
  add column tipo_caso text check (tipo_caso in ('administrativo','judicial')),
  add column arquivado_em timestamptz,
  add column arquivado_por uuid references public.adv_advogados(id),
  add column foto_path text check (foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  add column exclusao_em timestamptz;
create index renata_clientes_arquivo_data on public.adv_clientes ((arquivado_em is not null), criado_em desc, id);
create unique index renata_clientes_foto on public.adv_clientes(foto_path) where foto_path is not null;
grant select (tipo_caso,arquivado_em,arquivado_por,foto_path) on public.adv_clientes to authenticated;
grant update (tipo_caso) on public.adv_clientes to authenticated;

-- As constraints existentes de RG e CPF aceitam NULL. Valores anteriores são preservados.
create or replace function renata_privado.cliente_validar() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.rg is distinct from old.rg then
    new.rg := nullif(btrim(new.rg), '');
  end if;
  if tg_op = 'INSERT' or new.cpf is distinct from old.cpf then
    new.cpf := nullif(btrim(new.cpf), '');
    if new.cpf is not null and not renata_privado.cpf_valido(new.cpf) then
      raise exception 'CPF inválido' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' and new.tipo_caso is null then
    raise exception 'Selecione o tipo de caso jurídico' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.tipo_caso is not null and new.tipo_caso is null then
      raise exception 'Selecione o tipo de caso jurídico' using errcode = '23514';
    end if;
    new.versao := old.versao + 1;
    new.atualizado_em := now();
  end if;
  return new;
end $$;

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
      from unnest(array['nome','nome_social','endereco','rg','cpf','filiacao','nacionalidade','cidade_nascimento','tipo_caso','caso_juridico','status']) as chave(k)
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

create or replace function public.adv_registrar_cliente(p_dados jsonb, p_envio uuid, p_hash text) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare hash_existente text;
begin
  if p_envio is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.adv_clientes (
    id,nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,tipo_caso,caso_juridico,status,criado_em,envio_id,envio_hash
  ) values (
    gen_random_uuid(), p_dados ->> 'nome', nullif(p_dados ->> 'nome_social',''), p_dados ->> 'endereco',
    nullif(p_dados ->> 'rg',''), nullif(p_dados ->> 'cpf',''), p_dados ->> 'filiacao', p_dados ->> 'nacionalidade',
    p_dados ->> 'cidade_nascimento', p_dados ->> 'tipo_caso', p_dados ->> 'caso_juridico', 'novo', now(), p_envio, p_hash
  ) on conflict (envio_id) do nothing;
  if found then return true; end if;
  select envio_hash into hash_existente from public.adv_clientes where envio_id = p_envio;
  return coalesce(hash_existente = p_hash, false);
end $$;

-- Cadastro em exclusão deixa de ser consultável, inclusive por sessões antigas.
create policy renata_cliente_em_exclusao on public.adv_clientes as restrictive
for all to authenticated using (exclusao_em is null) with check (exclusao_em is null);
create policy renata_observacao_cliente_visivel on public.adv_observacoes as restrictive
for all to authenticated
using (exists (select 1 from public.adv_clientes c where c.id = cliente_id))
with check (exists (select 1 from public.adv_clientes c where c.id = cliente_id));
create policy renata_auditoria_cliente_visivel on public.adv_auditoria as restrictive
for select to authenticated
using (cliente_id is null or exists (select 1 from public.adv_clientes c where c.id = cliente_id));

create table renata_privado.retencao_clientes (
  cliente_id uuid primary key references public.adv_clientes(id) on delete cascade,
  versao integer not null check (versao >= 0),
  liberada_em timestamptz not null default now(),
  valida_ate timestamptz not null,
  aprovado_por uuid not null references public.adv_advogados(id),
  referencia text not null check (char_length(btrim(referencia)) between 1 and 120),
  check (valida_ate > liberada_em)
);
create table renata_privado.foto_operacoes (
  id uuid primary key,
  cliente_id uuid not null references public.adv_clientes(id) on delete cascade,
  advogado_id uuid not null references public.adv_advogados(id),
  versao integer not null,
  foto_path text not null unique,
  conteudo_hash text not null check (conteudo_hash ~ '^[0-9a-f]{64}$'),
  substituicao boolean not null,
  concluida boolean not null default false,
  expira_em timestamptz not null default (now() + interval '5 minutes')
);
create table renata_privado.storage_limpezas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.adv_clientes(id) on delete set null,
  foto_path text not null unique,
  disponivel_em timestamptz not null default now(),
  token uuid,
  lease_ate timestamptz,
  concluida_em timestamptz
);
create index renata_foto_operacoes_cliente on renata_privado.foto_operacoes(cliente_id);
create index renata_storage_limpezas_pendentes on renata_privado.storage_limpezas(disponivel_em) where concluida_em is null;
create index renata_storage_limpezas_cliente on renata_privado.storage_limpezas(cliente_id);
create table renata_privado.exclusoes (
  id uuid primary key,
  cliente_id uuid unique references public.adv_clientes(id) on delete set null,
  advogado_id uuid not null references public.adv_advogados(id),
  autorizada_em timestamptz not null default now(),
  concluida_em timestamptz,
  retencao_referencia text not null
);
do $$
declare tabela text;
begin
  foreach tabela in array array['retencao_clientes','foto_operacoes','storage_limpezas','exclusoes'] loop
    execute format('alter table renata_privado.%I enable row level security', tabela);
    execute format('revoke all on renata_privado.%I from public,anon,authenticated', tabela);
    execute format('grant select,insert,update,delete on renata_privado.%I to service_role', tabela);
  end loop;
end $$;

create or replace function renata_privado.observacao_preparar() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.adv_clientes c where c.id = new.cliente_id and c.exclusao_em is null for update;
  if not found then raise exception 'Cadastro indisponível' using errcode = 'P0002'; end if;
  -- Informação interna nova exige uma nova revisão antes da exclusão.
  delete from renata_privado.retencao_clientes where cliente_id = new.cliente_id;
  select a.nome into new.advogado_nome from public.adv_advogados a where a.id = new.advogado_id;
  new.criado_em := now();
  return new;
end $$;

create function renata_privado.exigir_gestao() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare autor uuid;
begin
  if auth.uid() is null or coalesce(renata_privado.permissao_atual(), '') <> 'gestao' then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  select a.id into autor from public.adv_advogados a where a.auth_user_id = auth.uid() and a.ativo;
  if autor is null then raise exception 'Acesso não autorizado' using errcode = '42501'; end if;
  return autor;
end $$;

create function renata_privado.cliente_para_alterar(p_id uuid, p_versao integer) returns public.adv_clientes
language plpgsql security definer set search_path = ''
as $$
declare cliente public.adv_clientes;
begin
  perform renata_privado.exigir_gestao();
  select * into cliente from public.adv_clientes where id = p_id for update;
  if not found or cliente.exclusao_em is not null then
    raise exception 'Cadastro indisponível' using errcode = 'P0002';
  end if;
  if p_versao is null or cliente.versao <> p_versao then
    raise exception 'Cadastro alterado. Atualize os detalhes.' using errcode = '40001';
  end if;
  return cliente;
end $$;

create function renata_privado.arquivar(p_id uuid, p_versao integer, p_arquivar boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare autor uuid := renata_privado.exigir_gestao();
declare cliente public.adv_clientes;
begin
  select * into cliente from public.adv_clientes where id = p_id for update;
  if not found or cliente.exclusao_em is not null then raise exception 'Cadastro indisponível' using errcode = 'P0002'; end if;
  if p_arquivar is null then raise exception 'Operação inválida' using errcode = '22023'; end if;
  if (cliente.arquivado_em is not null) = p_arquivar then return; end if;
  perform renata_privado.cliente_para_alterar(p_id, p_versao);
  update public.adv_clientes
  set arquivado_em = case when p_arquivar then now() else null end,
      arquivado_por = case when p_arquivar then autor else null end
  where id = p_id;
end $$;

create function renata_privado.foto_preparar(p_id uuid,p_versao integer,p_operacao uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare autor uuid := renata_privado.exigir_gestao();
declare cliente public.adv_clientes;
declare operacao renata_privado.foto_operacoes;
declare caminho text;
begin
  if p_operacao is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Operação inválida' using errcode = '22023';
  end if;
  select * into operacao from renata_privado.foto_operacoes where id = p_operacao;
  if found then
    if operacao.advogado_id <> autor or operacao.cliente_id <> p_id or operacao.conteudo_hash <> p_hash then
      raise exception 'Operação inválida' using errcode = '22023';
    end if;
    if not exists(select 1 from public.adv_clientes c where c.id = p_id and c.exclusao_em is null) then
      raise exception 'Cadastro indisponível' using errcode = 'P0002';
    end if;
    if not operacao.concluida and operacao.expira_em <= now() then
      raise exception 'Envio expirado. Selecione a foto novamente.' using errcode = '40001';
    end if;
    return jsonb_build_object('path',operacao.foto_path,'concluida',operacao.concluida,'substituicao',operacao.substituicao);
  end if;
  cliente := renata_privado.cliente_para_alterar(p_id, p_versao);
  caminho := p_id::text || '/' || p_operacao::text || '.webp';
  insert into renata_privado.foto_operacoes(id,cliente_id,advogado_id,versao,foto_path,conteudo_hash,substituicao)
  values(p_operacao,p_id,autor,p_versao,caminho,p_hash,cliente.foto_path is not null);
  insert into renata_privado.storage_limpezas(cliente_id,foto_path,disponivel_em)
  values(p_id,caminho,now() + interval '5 minutes');
  return jsonb_build_object('path',caminho,'concluida',false,'substituicao',cliente.foto_path is not null);
end $$;

create function renata_privado.foto_concluir(p_operacao uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare autor uuid := renata_privado.exigir_gestao();
declare operacao renata_privado.foto_operacoes;
declare cliente public.adv_clientes;
begin
  select * into operacao from renata_privado.foto_operacoes where id = p_operacao;
  if not found or operacao.advogado_id <> autor then raise exception 'Operação inválida' using errcode = '42501'; end if;
  if operacao.concluida then return; end if;
  -- Sempre bloqueie cliente antes de alterar a operação, na mesma ordem usada na exclusão.
  cliente := renata_privado.cliente_para_alterar(operacao.cliente_id, operacao.versao);
  if operacao.expira_em <= now() then raise exception 'Envio expirado' using errcode = '40001'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id = 'fotos-clientes' and o.name = operacao.foto_path) then
    raise exception 'Fotografia ainda não recebida' using errcode = 'P0002';
  end if;
  if cliente.foto_path is not null then
    insert into renata_privado.storage_limpezas(cliente_id,foto_path) values(cliente.id,cliente.foto_path)
    on conflict(foto_path) do update set disponivel_em = now(), concluida_em = null;
  end if;
  update public.adv_clientes set foto_path = operacao.foto_path where id = cliente.id;
  update renata_privado.foto_operacoes set concluida = true where id = p_operacao;
  delete from renata_privado.storage_limpezas where foto_path = operacao.foto_path;
end $$;

create function renata_privado.foto_remover(p_id uuid,p_versao integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare cliente public.adv_clientes;
begin
  perform renata_privado.exigir_gestao();
  select * into cliente from public.adv_clientes where id = p_id for update;
  if not found or cliente.exclusao_em is not null then raise exception 'Cadastro indisponível' using errcode = 'P0002'; end if;
  if cliente.foto_path is null then return; end if;
  perform renata_privado.cliente_para_alterar(p_id, p_versao);
  insert into renata_privado.storage_limpezas(cliente_id,foto_path) values(p_id,cliente.foto_path)
  on conflict(foto_path) do update set disponivel_em = now(), concluida_em = null;
  update public.adv_clientes set foto_path = null where id = p_id;
end $$;

create function renata_privado.pode_excluir(p_id uuid) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(renata_privado.permissao_atual(),'') <> 'gestao' then return false; end if;
  return exists (
    select 1 from public.adv_clientes c join renata_privado.retencao_clientes r on r.cliente_id = c.id
    where c.id = p_id and c.exclusao_em is null and r.versao = c.versao and r.liberada_em <= now() and r.valida_ate > now()
  );
end $$;

create function renata_privado.excluir(p_id uuid,p_versao integer,p_operacao uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare autor uuid := renata_privado.exigir_gestao();
declare operacao renata_privado.exclusoes;
declare cliente public.adv_clientes;
declare referencia text;
begin
  if p_operacao is null then raise exception 'Operação inválida' using errcode = '22023'; end if;
  select * into operacao from renata_privado.exclusoes where id = p_operacao;
  if found then
    if operacao.advogado_id <> autor or (operacao.cliente_id is not null and operacao.cliente_id <> p_id) then
      raise exception 'Operação inválida' using errcode = '42501';
    end if;
    return operacao.id;
  end if;
  cliente := renata_privado.cliente_para_alterar(p_id,p_versao);
  select r.referencia into referencia from renata_privado.retencao_clientes r
  where r.cliente_id = p_id and r.versao = cliente.versao and r.liberada_em <= now() and r.valida_ate > now()
  for share;
  if not found then
    raise exception 'Exclusão bloqueada por retenção. O cadastro pode ser arquivado.' using errcode = '42501';
  end if;
  insert into renata_privado.exclusoes(id,cliente_id,advogado_id,retencao_referencia)
  values(p_operacao,p_id,autor,referencia);
  if cliente.foto_path is not null then
    insert into renata_privado.storage_limpezas(cliente_id,foto_path) values(p_id,cliente.foto_path)
    on conflict(foto_path) do update set disponivel_em = now(), concluida_em = null;
  end if;
  update public.adv_clientes set exclusao_em = now() where id = p_id;
  return p_operacao;
end $$;

create function renata_privado.exclusao_estado(p_operacao uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare autor uuid := renata_privado.exigir_gestao();
declare estado text;
begin
  select case when e.concluida_em is null then 'pendente' else 'concluida' end into estado
  from renata_privado.exclusoes e where e.id = p_operacao and e.advogado_id = autor;
  if estado is null then raise exception 'Operação indisponível' using errcode = 'P0002'; end if;
  return estado;
end $$;

-- A Data API usa wrappers invoker. As operações privilegiadas ficam no schema privado
-- e verificam sessão, perfil ativo e permissão de gestão em cada chamada.
create function public.adv_cliente_arquivar(p_id uuid,p_versao integer,p_arquivar boolean) returns void
language sql security invoker set search_path = '' as $$ select renata_privado.arquivar(p_id,p_versao,p_arquivar) $$;
create function public.adv_foto_preparar(p_id uuid,p_versao integer,p_operacao uuid,p_hash text) returns jsonb
language sql security invoker set search_path = '' as $$ select renata_privado.foto_preparar(p_id,p_versao,p_operacao,p_hash) $$;
create function public.adv_foto_concluir(p_operacao uuid) returns void
language sql security invoker set search_path = '' as $$ select renata_privado.foto_concluir(p_operacao) $$;
create function public.adv_foto_remover(p_id uuid,p_versao integer) returns void
language sql security invoker set search_path = '' as $$ select renata_privado.foto_remover(p_id,p_versao) $$;
create function public.adv_cliente_pode_excluir(p_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select renata_privado.pode_excluir(p_id) $$;
create function public.adv_cliente_excluir(p_id uuid,p_versao integer,p_operacao uuid) returns uuid
language sql security invoker set search_path = '' as $$ select renata_privado.excluir(p_id,p_versao,p_operacao) $$;
create function public.adv_cliente_exclusao_estado(p_operacao uuid) returns text
language sql stable security invoker set search_path = '' as $$ select renata_privado.exclusao_estado(p_operacao) $$;

do $$
declare assinatura text;
begin
  foreach assinatura in array array[
    'arquivar(uuid,integer,boolean)','foto_preparar(uuid,integer,uuid,text)','foto_concluir(uuid)',
    'foto_remover(uuid,integer)','pode_excluir(uuid)','excluir(uuid,integer,uuid)','exclusao_estado(uuid)'
  ] loop
    execute 'revoke all on function renata_privado.' || assinatura || ' from public,anon,authenticated';
    execute 'grant execute on function renata_privado.' || assinatura || ' to authenticated';
  end loop;
  foreach assinatura in array array[
    'adv_cliente_arquivar(uuid,integer,boolean)','adv_foto_preparar(uuid,integer,uuid,text)','adv_foto_concluir(uuid)',
    'adv_foto_remover(uuid,integer)','adv_cliente_pode_excluir(uuid)','adv_cliente_excluir(uuid,integer,uuid)','adv_cliente_exclusao_estado(uuid)'
  ] loop
    execute 'revoke all on function public.' || assinatura || ' from public,anon,authenticated';
    execute 'grant execute on function public.' || assinatura || ' to authenticated';
  end loop;
end $$;
revoke all on function renata_privado.exigir_gestao(),renata_privado.cliente_para_alterar(uuid,integer) from public,anon,authenticated;

create function public.adv_storage_recolher(p_cliente uuid default null) returns table(id uuid,foto_path text,token uuid)
language sql security invoker set search_path = ''
as $$
  with candidatas as (
    select l.id from renata_privado.storage_limpezas l
    where l.concluida_em is null and l.disponivel_em <= now()
      and (l.lease_ate is null or l.lease_ate < now())
      and (p_cliente is null or l.cliente_id = p_cliente)
      and not exists (select 1 from public.adv_clientes c where c.foto_path = l.foto_path and c.exclusao_em is null)
    order by l.disponivel_em limit 25 for update skip locked
  )
  update renata_privado.storage_limpezas l set token = gen_random_uuid(), lease_ate = now() + interval '2 minutes'
  from candidatas q where l.id = q.id returning l.id,l.foto_path,l.token
$$;
create function public.adv_storage_concluir(p_ids uuid[],p_tokens uuid[]) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if cardinality(p_ids) is distinct from cardinality(p_tokens) or cardinality(p_ids) > 25 then
    raise exception 'Lote inválido' using errcode = '22023';
  end if;
  update renata_privado.storage_limpezas l set concluida_em = now()
  from unnest(p_ids,p_tokens) as lote(id,token)
  where l.id = lote.id and l.token = lote.token;
end $$;
create function public.adv_storage_pendentes(p_cliente uuid default null) returns bigint
language sql stable security invoker set search_path = ''
as $$
  select count(*) from renata_privado.storage_limpezas
  where concluida_em is null and (p_cliente is null or cliente_id = p_cliente)
$$;
create function public.adv_storage_finalizar_exclusoes(p_cliente uuid default null) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare operacao renata_privado.exclusoes;
declare removidos integer := 0;
declare nome_autor text;
begin
  for operacao in select e.* from renata_privado.exclusoes e
    where e.concluida_em is null and (p_cliente is null or e.cliente_id = p_cliente)
    order by e.autorizada_em limit 25 for update skip locked
  loop
    perform 1 from public.adv_clientes where id = operacao.cliente_id for update;
    if exists(select 1 from renata_privado.storage_limpezas l where l.cliente_id = operacao.cliente_id and l.concluida_em is null) then
      continue;
    end if;
    select a.nome into nome_autor from public.adv_advogados a where a.id = operacao.advogado_id;
    delete from public.adv_observacoes where cliente_id = operacao.cliente_id;
    delete from public.adv_auditoria where cliente_id = operacao.cliente_id;
    delete from renata_privado.storage_limpezas where cliente_id = operacao.cliente_id;
    delete from public.adv_clientes where id = operacao.cliente_id;
    update renata_privado.exclusoes set concluida_em = now() where id = operacao.id;
    insert into public.adv_auditoria(id,cliente_id,advogado_id,advogado_nome,acao,detalhes,criado_em)
    values(gen_random_uuid(),null,operacao.advogado_id,nome_autor,'exclusao',jsonb_build_object('operacao',operacao.id),now());
    removidos := removidos + 1;
  end loop;
  -- Somente metadados de caminhos de operações já resolvidas, após a janela de recuperação.
  delete from renata_privado.foto_operacoes where expira_em < now() - interval '1 day';
  delete from renata_privado.storage_limpezas where concluida_em < now() - interval '1 day';
  return removidos;
end $$;
revoke all on function public.adv_storage_recolher(uuid),public.adv_storage_concluir(uuid[],uuid[]),public.adv_storage_pendentes(uuid),public.adv_storage_finalizar_exclusoes(uuid) from public,anon,authenticated;
grant execute on function public.adv_storage_recolher(uuid),public.adv_storage_concluir(uuid[],uuid[]),public.adv_storage_pendentes(uuid),public.adv_storage_finalizar_exclusoes(uuid) to service_role;

create function public.adv_listar_clientes_v2(p_nome text,p_status text,p_inicio date,p_fim date,p_arquivados boolean)
returns table(id uuid,nome text,criado_em timestamptz,status text,tipo_caso text,arquivado_em timestamptz,tem_foto boolean)
language sql stable security invoker
as $$
  select c.id,c.nome::text,c.criado_em,c.status::text,c.tipo_caso,c.arquivado_em,c.foto_path is not null
  from public.adv_clientes c
  where (coalesce(p_nome,'') = '' or c.nome ilike '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_nome,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_') || '%')
    and (p_status is null or c.status = p_status)
    and (p_inicio is null or c.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo'))
    and (p_fim is null or c.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo'))
    and (c.arquivado_em is not null) = coalesce(p_arquivados,false)
$$;
create or replace function public.adv_listar_clientes(p_nome text,p_status text,p_inicio date,p_fim date)
returns table(id uuid,nome text,criado_em timestamptz,status text)
language sql stable security invoker
as $$ select c.id,c.nome,c.criado_em,c.status from public.adv_listar_clientes_v2(p_nome,p_status,p_inicio,p_fim,false) c $$;
create function public.adv_totais_clientes_v2(p_arquivados boolean) returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'total',count(*) filter(where (arquivado_em is not null) = p_arquivados),
    'novos',count(*) filter(where (arquivado_em is not null) = p_arquivados and status = 'novo'),
    'andamento',count(*) filter(where (arquivado_em is not null) = p_arquivados and status = 'em_andamento'),
    'concluidos',count(*) filter(where (arquivado_em is not null) = p_arquivados and status = 'concluido'),
    'ativos',count(*) filter(where arquivado_em is null),
    'arquivados',count(*) filter(where arquivado_em is not null)
  ) from public.adv_clientes
$$;
create or replace function public.adv_totais_clientes() returns json
language sql stable security invoker set search_path = ''
as $$ select public.adv_totais_clientes_v2(false) $$;
revoke all on function public.adv_listar_clientes_v2(text,text,date,date,boolean),public.adv_totais_clientes_v2(boolean) from public,anon,authenticated;
grant execute on function public.adv_listar_clientes_v2(text,text,date,date,boolean),public.adv_totais_clientes_v2(boolean) to authenticated;

-- O bucket é privado. Escritas passam pelo servidor, após validação e normalização.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fotos-clientes','fotos-clientes',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false,file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create function renata_privado.pode_ler_foto(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and renata_privado.permissao_atual() is not null
    and exists(select 1 from public.adv_clientes c where c.foto_path = p_path and c.exclusao_em is null)
$$;
revoke all on function renata_privado.pode_ler_foto(text) from public,anon,authenticated;
grant execute on function renata_privado.pode_ler_foto(text) to authenticated;
create policy renata_fotos_leitura on storage.objects for select to authenticated
using(bucket_id = 'fotos-clientes' and renata_privado.pode_ler_foto(name));
create policy renata_fotos_restricao_leitura on storage.objects as restrictive for select to authenticated
using(bucket_id <> 'fotos-clientes' or renata_privado.pode_ler_foto(name));
create policy renata_fotos_sem_publico on storage.objects as restrictive for all to anon
using(bucket_id <> 'fotos-clientes') with check(bucket_id <> 'fotos-clientes');
create policy renata_fotos_escrita_servidor on storage.objects as restrictive for insert to authenticated
with check(bucket_id <> 'fotos-clientes');
create policy renata_fotos_alteracao_servidor on storage.objects as restrictive for update to authenticated
using(bucket_id <> 'fotos-clientes') with check(bucket_id <> 'fotos-clientes');
create policy renata_fotos_remocao_servidor on storage.objects as restrictive for delete to authenticated
using(bucket_id <> 'fotos-clientes');

commit;
