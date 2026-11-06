# Resultado da inspeção do Supabase — Controle Cliente Renata

**Fonte:** metadados reais consultados em 06/11/2026 no projeto Supabase `srvzdpkaqnxvydxinfco` (projeto ainda identificado como `Aula03/08/2026` no painel).  
**Escopo:** somente as quatro tabelas `public.adv_*` da aplicação.  
**Privacidade:** não foram consultados registros, cadastros, senhas, tokens ou chaves.  
**Operação:** leitura; nenhuma alteração foi feita nesta inspeção.

## Tabelas e RLS

| Tabela | RLS ativado | RLS forçado | Políticas RLS |
|---|---|---|---|
| `public.adv_advogados` | Sim | Não | Nenhuma |
| `public.adv_clientes` | Sim | Não | Nenhuma |
| `public.adv_observacoes` | Sim | Não | Nenhuma |
| `public.adv_auditoria` | Sim | Não | Nenhuma |

O resultado de `pg_policies` para essas quatro tabelas foi `[]`. Isso significa que não existem políticas RLS específicas configuradas. A inspeção de privilégios (`information_schema.role_table_grants`) mostrou concessões para `service_role`, mas nenhuma concessão para `anon` ou `authenticated` nas quatro tabelas. **Não abra o acesso público apenas para fazer o sistema funcionar.** O backend precisa verificar autenticação, autorização e o status do advogado antes de qualquer leitura ou alteração.

## Colunas existentes

### `public.adv_advogados`

| Coluna | Tipo | Aceita NULL? | Default |
|---|---|---|---|
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `auth_user_id` | `uuid` | Não | — |
| `nome` | `text` | Não | — |
| `email_login` | `text` | Não | — |
| `oab_numero` | `text` | Não | — |
| `oab_uf` | `char(2)` | Não | — |
| `ativo` | `boolean` | Não | `true` |
| `criado_em` | `timestamptz` | Não | `now()` |

### `public.adv_clientes`

| Coluna | Tipo | Aceita NULL? | Default |
|---|---|---|---|
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `nome` | `text` | Não | — |
| `nome_social` | `text` | Sim | — |
| `endereco` | `text` | Não | — |
| `rg` | `text` | Não | — |
| `cpf` | `varchar(11)` | Não | — |
| `filiacao` | `text` | Não | — |
| `nacionalidade` | `text` | Não | — |
| `cidade_nascimento` | `text` | Não | — |
| `caso_juridico` | `text` | Não | — |
| `status` | `text` | Não | `'novo'::text` |
| `criado_em` | `timestamptz` | Não | `now()` |
| `atualizado_em` | `timestamptz` | Não | `now()` |

### `public.adv_observacoes`

| Coluna | Tipo | Aceita NULL? | Default |
|---|---|---|---|
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `cliente_id` | `uuid` | Não | — |
| `advogado_id` | `uuid` | Não | — |
| `texto` | `text` | Não | — |
| `criado_em` | `timestamptz` | Não | `now()` |

### `public.adv_auditoria`

| Coluna | Tipo | Aceita NULL? | Default |
|---|---|---|---|
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `advogado_id` | `uuid` | Não | — |
| `cliente_id` | `uuid` | Sim | — |
| `acao` | `text` | Não | — |
| `criado_em` | `timestamptz` | Não | `now()` |

## Restrições existentes

### `adv_advogados`

- `PRIMARY KEY (id)`
- `UNIQUE (auth_user_id)`
- `UNIQUE (email_login)`
- `UNIQUE (oab_uf, oab_numero)`
- `FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `CHECK (char_length(btrim(nome)) >= 2 AND char_length(btrim(nome)) <= 150)`
- `CHECK (char_length(btrim(oab_numero)) >= 1 AND char_length(btrim(oab_numero)) <= 20)`
- `CHECK (oab_uf ~ '^[A-Z]{2}$'::text)`

### `adv_clientes`

- `PRIMARY KEY (id)`
- `CHECK (char_length(btrim(nome)) >= 2 AND char_length(btrim(nome)) <= 200)`
- `CHECK (char_length(btrim(endereco)) >= 5)`
- `CHECK (char_length(btrim(rg)) >= 3)`
- `CHECK (cpf::text ~ '^[0-9]{11}$'::text)` — valida somente o formato de 11 dígitos, não os dígitos verificadores
- `CHECK (char_length(btrim(filiacao)) >= 2)`
- `CHECK (char_length(btrim(nacionalidade)) >= 2)`
- `CHECK (char_length(btrim(cidade_nascimento)) >= 2)`
- `CHECK (char_length(btrim(caso_juridico)) >= 10)`
- `CHECK (status = ANY (ARRAY['novo'::text, 'em_andamento'::text, 'concluido'::text]))`

### `adv_observacoes`

- `PRIMARY KEY (id)`
- `FOREIGN KEY (cliente_id) REFERENCES adv_clientes(id) ON DELETE CASCADE`
- `FOREIGN KEY (advogado_id) REFERENCES adv_advogados(id) ON DELETE RESTRICT`
- `CHECK (char_length(btrim(texto)) >= 1 AND char_length(btrim(texto)) <= 10000)`

### `adv_auditoria`

- `PRIMARY KEY (id)`
- `FOREIGN KEY (advogado_id) REFERENCES adv_advogados(id) ON DELETE RESTRICT`
- `FOREIGN KEY (cliente_id) REFERENCES adv_clientes(id) ON DELETE SET NULL`

## Índices identificados

- `adv_advogados_auth_user_id_key` — UNIQUE (`auth_user_id`)
- `adv_advogados_email_login_key` — UNIQUE (`email_login`)
- `adv_advogados_oab_uf_oab_numero_key` — UNIQUE (`oab_uf`, `oab_numero`)
- `adv_advogados_pkey` — PRIMARY KEY (`id`)
- `adv_clientes_pkey` — PRIMARY KEY (`id`)
- `adv_clientes_nome_idx` — (`nome`)
- `adv_clientes_status_idx` — (`status`)
- `adv_clientes_criado_em_idx` — (`criado_em DESC`)
- `adv_observacoes_pkey` — PRIMARY KEY (`id`)
- `adv_observacoes_cliente_idx` — (`cliente_id`, `criado_em DESC`)
- `adv_auditoria_pkey` — PRIMARY KEY (`id`)
- `adv_auditoria_cliente_idx` — (`cliente_id`, `criado_em DESC`)

## Privilégios identificados

Para cada uma das quatro tabelas, `information_schema.role_table_grants` retornou concessões para `service_role`: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`, `TRIGGER` e `TRUNCATE`. Não retornou concessões para `anon` ou `authenticated` nas quatro tabelas.

## Orientações para o Codex

1. **Não recrie as quatro tabelas**: elas já existem. Prepare migrações incrementais compatíveis com a estrutura atual.
2. **Nenhuma política RLS está definida**. Avalie cuidadosamente o modelo de acesso. Não faça `GRANT` indiscriminado nem crie política `USING (true)` para leitura de dados de clientes.
3. O envio público de cadastros deve ocorrer exclusivamente por endpoint de servidor validado, com limitação de abusos; nunca disponibilize listagem pública.
4. O login deve associar OAB + UF à conta correta de Supabase Auth no servidor e validar senha e advogado ativo. Não mantenha senhas em tabelas personalizadas.
5. O banco possui campo `atualizado_em`, mas esta inspeção não confirma trigger de atualização automática; implemente a atualização corretamente no backend ou crie migração revisada.
6. `cpf` deve ser validado no backend, inclusive os dígitos verificadores; a restrição SQL atual verifica apenas 11 dígitos numéricos.
7. Não execute mudanças destrutivas, não use registros reais nos testes, não exponha chaves ou informações pessoais.

Para reproduzir a consulta de metadados sem ler cadastros, use `supabase/inspecionar.sql`.
