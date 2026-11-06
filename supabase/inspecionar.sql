-- Controle Cliente Renata — inspeção de METADADOS (somente leitura)
-- Projeto Supabase (ref): srvzdpkaqnxvydxinfco
-- Consulta exclusivamente catálogos do PostgreSQL / information_schema.
-- NÃO acessa linhas de adv_clientes, adv_advogados, auth.users, nem senhas ou chaves.
-- NÃO modifica nada no banco. Retorna um JSON com colunas, constraints,
-- índices, políticas, status RLS e permissões de papéis da aplicação.

WITH wanted_tables AS (
  SELECT
    c.oid,
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname IN (
      'adv_advogados', 'adv_clientes', 'adv_observacoes', 'adv_auditoria'
    )
)
SELECT jsonb_build_object(
  'tables', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', table_name,
        'schema', schema_name,
        'rls_enabled', rls_enabled,
        'rls_forced', rls_forced
      ) ORDER BY table_name), '[]'::jsonb
    )
    FROM wanted_tables
  ),
  'columns', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', c.table_name,
        'position', c.ordinal_position,
        'name', c.column_name,
        'type', c.data_type,
        'udt', c.udt_name,
        'max_length', c.character_maximum_length,
        'nullable', c.is_nullable,
        'default', c.column_default
      ) ORDER BY c.table_name, c.ordinal_position), '[]'::jsonb
    )
    FROM information_schema.columns AS c
    WHERE c.table_schema = 'public'
      AND c.table_name IN (SELECT table_name FROM wanted_tables)
  ),
  'constraints', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', t.table_name,
        'name', con.conname,
        'kind', con.contype,
        'definition', pg_catalog.pg_get_constraintdef(con.oid, true)
      ) ORDER BY t.table_name, con.conname), '[]'::jsonb
    )
    FROM pg_catalog.pg_constraint AS con
    JOIN wanted_tables AS t ON t.oid = con.conrelid
  ),
  'policies', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', p.tablename,
        'name', p.policyname,
        'permissive', p.permissive,
        'roles', p.roles,
        'cmd', p.cmd,
        'qual', p.qual,
        'with_check', p.with_check
      ) ORDER BY p.tablename, p.policyname), '[]'::jsonb
    )
    FROM pg_catalog.pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename IN (SELECT table_name FROM wanted_tables)
  ),
  'indexes', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', i.tablename,
        'name', i.indexname,
        'definition', i.indexdef
      ) ORDER BY i.tablename, i.indexname), '[]'::jsonb
    )
    FROM pg_catalog.pg_indexes AS i
    WHERE i.schemaname = 'public'
      AND i.tablename IN (SELECT table_name FROM wanted_tables)
  ),
  'grants', (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'table', g.table_name,
        'grantee', g.grantee,
        'privilege', g.privilege_type
      ) ORDER BY g.table_name, g.grantee, g.privilege_type), '[]'::jsonb
    )
    FROM information_schema.role_table_grants AS g
    WHERE g.table_schema = 'public'
      AND g.table_name IN (SELECT table_name FROM wanted_tables)
      AND g.grantee IN ('anon', 'authenticated', 'service_role')
  )
) AS structure_only_metadata;
