-- Modelo operacional. Executar individualmente no SQL Editor após a revisão do escritório.
-- Use uma referência interna de autorização, sem documentos ou narrativa do caso.
-- A liberação permite iniciar a exclusão por 24 horas. O painel ainda exige confirmação.
begin;
do $liberacao$
declare
  decisao jsonb := $config$
  {
    "cliente_id": null,
    "aprovado_por": null,
    "referencia": "",
    "revisao_concluida": false
  }
  $config$::jsonb;
  cliente uuid;
  autor uuid;
  versao_revisada integer;
begin
  if coalesce(decisao ->> 'revisao_concluida','') <> 'true'
    or decisao ->> 'cliente_id' is null or decisao ->> 'aprovado_por' is null
    or coalesce(char_length(btrim(decisao ->> 'referencia')),0) not between 1 and 120 then
    raise exception 'Registre a revisão de retenção, os identificadores e a referência da autorização.';
  end if;
  cliente := (decisao ->> 'cliente_id')::uuid;
  autor := (decisao ->> 'aprovado_por')::uuid;
  if not exists(select 1 from public.adv_advogados where id = autor and ativo and permissao = 'gestao') then
    raise exception 'A aprovação precisa identificar um advogado ativo com permissão de gestão.';
  end if;
  select versao into versao_revisada from public.adv_clientes where id = cliente and exclusao_em is null for update;
  if not found then raise exception 'Cadastro indisponível para liberação.'; end if;
  insert into renata_privado.retencao_clientes(cliente_id,versao,liberada_em,valida_ate,aprovado_por,referencia)
  values(cliente,versao_revisada,now(),now()+interval '24 hours',autor,btrim(decisao ->> 'referencia'))
  on conflict(cliente_id) do update
  set versao = excluded.versao, liberada_em = excluded.liberada_em, valida_ate = excluded.valida_ate,
      aprovado_por = excluded.aprovado_por, referencia = excluded.referencia;
end
$liberacao$;
commit;
