-- srvzdpkaqnxvydxinfco: revisar metadados antes da execução única no SQL Editor.
-- Não modifica conteúdos existentes, não publica o bucket nem altera a autenticação.
begin;
do $$
begin
  if to_regprocedure('public.adv_cadastro_foto_preparar(uuid,text)') is not null
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
alter table public.adv_clientes add column if not exists andamento_caso text;
do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='adv_clientes'
    and column_name='andamento_caso' and data_type='text' and is_nullable='YES') then
    raise exception 'A coluna de andamento existente deve ser TEXT e aceitar NULL. Nenhum conteúdo foi modificado.';
  end if;
end $$;
grant select (andamento_caso), update (andamento_caso) on public.adv_clientes to authenticated;

-- Operação pública mediada pelo servidor. Nenhum papel do navegador acessa esta tabela.
-- O identificador do cliente é reservado antes do INSERT, sem conter dados pessoais.
create table renata_privado.cadastro_fotos (
  envio_id uuid primary key,
  cliente_id uuid not null default gen_random_uuid(),
  envio_hash text not null check (envio_hash ~ '^[0-9a-f]{64}$'),
  foto_path text not null unique,
  expira_em timestamptz not null default (now() + interval '5 minutes')
);
create index renata_cadastro_fotos_cliente on renata_privado.cadastro_fotos(cliente_id);
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

create or replace function public.adv_storage_finalizar_exclusoes(p_cliente uuid default null) returns integer
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
    delete from renata_privado.cadastro_fotos where cliente_id = operacao.cliente_id;
    delete from public.adv_clientes where id = operacao.cliente_id;
    update renata_privado.exclusoes set concluida_em = now() where id = operacao.id;
    insert into public.adv_auditoria(id,cliente_id,advogado_id,advogado_nome,acao,detalhes,criado_em)
    values(gen_random_uuid(),null,operacao.advogado_id,nome_autor,'exclusao',jsonb_build_object('operacao',operacao.id),now());
    removidos := removidos + 1;
  end loop;
  -- Somente metadados de caminhos de operações já resolvidas, após a janela de recuperação.
  delete from renata_privado.foto_operacoes where expira_em < now() - interval '1 day';
  delete from renata_privado.storage_limpezas where concluida_em < now() - interval '1 day';
  delete from renata_privado.cadastro_fotos c where c.expira_em < now() - interval '1 day'
    and not exists(select 1 from renata_privado.storage_limpezas l where l.foto_path = c.foto_path and l.concluida_em is null);
  return removidos;
end $$;

notify pgrst, 'reload schema';
commit;
