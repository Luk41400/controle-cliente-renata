import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

export const authFixture = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  grant usage on schema auth to authenticated, service_role, anon;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now(), not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select (auth.jwt() ->> 'sub')::uuid $$;
`;

export async function featureDatabase() {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(authFixture);
  await db.exec(await readFile(new URL("../supabase/testes/estrutura.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261106223752_adv_protecao_e_operacoes.sql", import.meta.url), "utf8"));
  // Reprodução de metadados do Storage. Os objetos binários são testados separadamente.
  await db.exec(`
    create schema storage;
    grant usage on schema storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    create policy legado on storage.objects using(true) with check(true);
  `);
  return db;
}

export async function asRole(db, role, sub, session, callback) {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, session_id: session })]);
    return await callback();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
  }
}
