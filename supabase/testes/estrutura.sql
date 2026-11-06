-- Replica o contrato registrado em resultado-inspecao.md.
-- Use exclusivamente em banco de teste vazio.
create table public.adv_advogados (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 150),
  email_login text not null unique,
  oab_numero text not null check (char_length(btrim(oab_numero)) between 1 and 20),
  oab_uf char(2) not null check (oab_uf ~ '^[A-Z]{2}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (oab_uf, oab_numero)
);
create table public.adv_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  nome_social text,
  endereco text not null check (char_length(btrim(endereco)) >= 5),
  rg text not null check (char_length(btrim(rg)) >= 3),
  cpf varchar(11) not null check (cpf::text ~ '^[0-9]{11}$'),
  filiacao text not null check (char_length(btrim(filiacao)) >= 2),
  nacionalidade text not null check (char_length(btrim(nacionalidade)) >= 2),
  cidade_nascimento text not null check (char_length(btrim(cidade_nascimento)) >= 2),
  caso_juridico text not null check (char_length(btrim(caso_juridico)) >= 10),
  status text not null default 'novo' check (status in ('novo','em_andamento','concluido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table public.adv_observacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.adv_clientes(id) on delete cascade,
  advogado_id uuid not null references public.adv_advogados(id) on delete restrict,
  texto text not null check (char_length(btrim(texto)) between 1 and 10000),
  criado_em timestamptz not null default now()
);
create table public.adv_auditoria (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.adv_clientes(id) on delete set null,
  advogado_id uuid not null references public.adv_advogados(id) on delete restrict,
  acao text not null,
  criado_em timestamptz not null default now()
);
create index adv_clientes_nome_idx on public.adv_clientes(nome);
create index adv_clientes_status_idx on public.adv_clientes(status);
create index adv_clientes_criado_em_idx on public.adv_clientes(criado_em desc);
create index adv_observacoes_cliente_idx on public.adv_observacoes(cliente_id, criado_em desc);
create index adv_auditoria_cliente_idx on public.adv_auditoria(cliente_id, criado_em desc);
alter table public.adv_advogados enable row level security;
alter table public.adv_clientes enable row level security;
alter table public.adv_observacoes enable row level security;
alter table public.adv_auditoria enable row level security;
grant all on public.adv_advogados, public.adv_clientes, public.adv_observacoes, public.adv_auditoria to service_role;

