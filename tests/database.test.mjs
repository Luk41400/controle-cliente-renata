import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const structure = new URL("../supabase/testes/estrutura.sql", import.meta.url);
const migrations = new URL("../supabase/migrations/", import.meta.url);
const manager = "10000000-0000-4000-8000-000000000001";
const reader = "10000000-0000-4000-8000-000000000002";
const unknown = "10000000-0000-4000-8000-000000000003";
const lawyerId = "10000000-0000-4000-8000-000000000004";
const readerId = "10000000-0000-4000-8000-000000000005";
const managerSession = "20000000-0000-4000-8000-000000000001";
const readerSession = "20000000-0000-4000-8000-000000000002";
const unknownSession = "20000000-0000-4000-8000-000000000003";
const submission = "30000000-0000-4000-8000-000000000001";
const legacyId = "40000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const client = {
  nome: "Maria Exemplo", nome_social: "Maria de Teste", endereco: "Endereço sintético",
  rg: "MG-TESTE", cpf: "52998224725", filiacao: "Filiação sintética", nacionalidade: "brasileira",
  cidade_nascimento: "São Paulo", caso_juridico: "Primeira linha sintética.\nSegunda linha do caso de teste.",
};

const authFixture = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  grant usage on schema auth to authenticated, service_role, anon;
  create table auth.users(id uuid primary key);
  create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now(), not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select (auth.jwt() ->> 'sub')::uuid $$;
`;

test("migração, operações, permissões e auditoria em PostgreSQL descartável", async (t) => {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  t.after(() => db.close());
  await db.exec(authFixture);
  const files = (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort();
  const sql = await readFile(new URL(files[0], migrations), "utf8");
  await assert.rejects(db.exec(sql), /Colunas ausentes ou incompatíveis/);
  await db.exec("rollback");
  await db.exec(await readFile(structure, "utf8"));
  await db.exec(`
    alter table adv_clientes enable row level security;
    create policy antiga on adv_clientes using (true) with check (true);
    grant select (id), update (status) on adv_clientes to anon, authenticated;
    insert into auth.users values ('${manager}'), ('${reader}'), ('${unknown}');
    insert into auth.sessions(id,user_id) values ('${managerSession}','${manager}'), ('${readerSession}','${reader}'), ('${unknownSession}','${unknown}');
    insert into adv_advogados (id,auth_user_id,nome,email_login,oab_numero,oab_uf,ativo) values
      ('${lawyerId}','${manager}','Advogada de Teste','gestao@example.test','00123-A','SP',true),
      ('${readerId}','${reader}','Advogado Consulta','consulta@example.test','345','SP',true);
    insert into adv_clientes (id,nome,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico,status)
      values ('${legacyId}','Cliente Legado','Rua de teste','RG-LEGADO','11111111111','Família','Brasileira','São Paulo','Relato de teste já existente.','concluido');
    insert into adv_observacoes (cliente_id,advogado_id,texto) values ('${legacyId}','${lawyerId}','Observação anterior à migração');
    insert into adv_auditoria (cliente_id,advogado_id,acao) values ('${legacyId}','${lawyerId}','evento_anterior');
  `);
  await db.exec(sql);
  assert.equal((await db.query("select permissao from adv_advogados where id=$1", [lawyerId])).rows[0].permissao, "consulta");
  await db.query("update adv_advogados set permissao='gestao' where id=$1", [lawyerId]);

  await t.test("migração preserva cadastros, permissões conservadoras e autoria de registros existentes", async () => {
    assert.equal((await db.query("select status,cpf from adv_clientes where id=$1", [legacyId])).rows[0].cpf, "11111111111");
    assert.equal((await db.query("select advogado_nome,texto from adv_observacoes where cliente_id=$1", [legacyId])).rows[0].advogado_nome, "Advogada de Teste");
    assert.equal((await db.query("select advogado_nome,acao from adv_auditoria where cliente_id=$1", [legacyId])).rows[0].acao, "evento_anterior");
  });

  async function withRole(role, callback, sub, session_id) {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, session_id })]);
      await callback();
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', '{}', false)");
    }
  }

  const register = (payload = client, digest = hash, id = submission) =>
    db.query("select adv_registrar_cliente($1,$2,$3) as ok", [payload, id, digest]);
  const queryIds = () => db.query("select id from adv_clientes");
  await t.test("cadastro idempotente, validação e limite persistente", async () => {
    await withRole("service_role", async () => {
      assert.equal((await register()).rows[0].ok, true);
      assert.equal((await register()).rows[0].ok, true);
      assert.equal((await register(client, "c".repeat(64))).rows[0].ok, false);
      await assert.rejects(register({ ...client, cpf: "11111111111" }, hash, unknown), /CPF inválido/);
      const limit = () => db.query("select adv_limitar_tentativas($1, 60, 2) as ok", [hash]);
      assert.equal((await limit()).rows[0].ok, true);
      assert.equal((await limit()).rows[0].ok, true);
      assert.equal((await limit()).rows[0].ok, false);
    });
    assert.equal((await queryIds()).rows.length, 2);
  });

  await t.test("anon, usuário sem perfil e sessão revogada não leem cadastros", async () => {
    await withRole("anon", async () => {
      await assert.rejects(queryIds(), /permission denied/);
      await assert.rejects(register(), /permission denied/);
      await assert.rejects(db.query("select id from adv_observacoes"), /permission denied/);
      await assert.rejects(db.query("select id from adv_auditoria"), /permission denied/);
    });
    await withRole("authenticated", async () => {
      assert.equal((await queryIds()).rows.length, 0);
      await assert.rejects(register(), /permission denied/);
      await assert.rejects(db.query("update adv_advogados set ativo = true"), /permission denied/);
    }, unknown, unknownSession);
    await withRole("authenticated", async () => {
      assert.equal((await queryIds()).rows.length, 0);
    }, manager, unknownSession);
  });

  const id = (await db.query("select id from adv_clientes where nome=$1", [client.nome])).rows[0].id;
  await t.test("consulta, busca parcial literal, datas e perfil somente leitura", async () => {
    await withRole("authenticated", async () => {
      assert.equal((await db.query("select id from adv_listar_clientes('ria ex','novo', null, null)")).rows[0].id, id);
      assert.equal((await db.query("select id from adv_listar_clientes('%','novo', null, null)")).rows.length, 0);
      assert.equal((await db.query("select id from adv_listar_clientes('','novo', '1990-01-01', '1990-01-02')")).rows.length, 0);
      assert.equal((await db.query("select id from adv_listar_clientes('','concluido', null, null)")).rows[0].id, legacyId);
      assert.equal((await db.query("select adv_totais_clientes() as stats")).rows[0].stats.novos, 1);
      const detail = (await db.query("select nome,nome_social,endereco,rg,cpf,filiacao,nacionalidade,cidade_nascimento,caso_juridico from adv_clientes where id=$1", [id])).rows[0];
      assert.deepEqual(detail, client);
      assert.equal((await db.query("update adv_clientes set status = 'concluido' returning id")).rows.length, 0);
      await assert.rejects(db.query("select envio_hash from adv_clientes"), /permission denied/);
      await assert.rejects(db.query("select email_login from adv_advogados"), /permission denied/);
    }, reader, readerSession);
  });

  await t.test("edição por versão, status, autor da observação e trilha de auditoria", async () => {
    await withRole("authenticated", async () => {
      assert.equal((await db.query("update adv_clientes set status='em_andamento' where id=$1 and versao=0 returning versao", [id])).rows[0].versao, 1);
      assert.equal((await db.query("update adv_clientes set status='concluido' where id=$1 and versao=0 returning id", [id])).rows.length, 0);
      assert.equal((await db.query("update adv_clientes set endereco='Endereço corrigido' where id=$1 and versao=1 returning versao", [id])).rows[0].versao, 2);
      assert.equal((await db.query("update adv_clientes set status='em_andamento' where id=$1 returning versao", [legacyId])).rows[0].versao, 1);
      await assert.rejects(db.query("insert into adv_observacoes(cliente_id,advogado_id,texto) values ($1,$2,'Autoria falsa')", [id, readerId]), /row-level security/);
      await db.query("insert into adv_observacoes(cliente_id,advogado_id,texto) values ($1,$2,'Observação sintética')", [id, lawyerId]);
      assert.equal((await db.query("select advogado_nome from adv_observacoes where cliente_id=$1", [id])).rows[0].advogado_nome, "Advogada de Teste");
      const history = (await db.query("select acao, advogado_nome, detalhes from adv_auditoria where cliente_id=$1", [id])).rows;
      assert.equal(history.length, 4);
      assert.ok(history.some(({ detalhes }) => detalhes.status_novo === "em_andamento"));
      assert.ok(history.some(({ detalhes }) => detalhes.campos?.includes("endereco")));
      assert.ok(history.some(({ acao, advogado_nome }) => acao === "observacao" && advogado_nome === "Advogada de Teste"));
      assert.doesNotMatch(JSON.stringify(history), /Endereço corrigido|Observação sintética|52998224725/);
    }, manager, managerSession);
  });

  await t.test("desativação e logout revogam acesso a dados existentes", async () => {
    await db.query("update adv_advogados set ativo=false where auth_user_id=$1", [manager]);
    await db.query("delete from auth.sessions where id=$1", [readerSession]);
    for (const [user, session] of [[manager, managerSession], [reader, readerSession]]) {
      await withRole("authenticated", async () => {
        assert.equal((await queryIds()).rows.length, 0);
        assert.equal((await db.query("select id from adv_observacoes")).rows.length, 0);
        assert.equal((await db.query("select id from adv_auditoria")).rows.length, 0);
      }, user, session);
    }
  });
});
