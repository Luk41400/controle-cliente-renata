# Controle Cliente Renata

Portal de atendimento jurídico em um único domínio. A página `/` recebe os cadastros, `/admin` apresenta o login e o painel privado, e `/privacidade` apresenta a minuta da política do escritório.

## Funcionalidades

- Cadastro público com os nove campos solicitados, CPF validado no navegador, no servidor e no PostgreSQL, e confirmação após a gravação. Reenvios com o mesmo identificador e conteúdo são idempotentes.
- Login por OAB, UF e senha com Supabase Auth. A associação com a conta de autenticação é consultada pelo servidor. As operações administrativas usam a sessão do advogado e respeitam RLS.
- Indicadores do banco, busca parcial por nome, filtros por status e período, ordenação e páginas de 12 registros.
- Painel lateral com todos os dados, edição com controle de versão, status, observações com autoria e histórico. As alterações e a auditoria são gravadas na mesma transação.
- Interface em português, com layout para computador e celular, foco visível e navegação por teclado.

## Executar localmente

Requisitos de desenvolvimento: Node.js 24, npm e um Supabase de teste configurado conforme o [guia de implantação](docs/implantacao.md).

```powershell
npm ci
Copy-Item .env.example .env.local
# Preencha .env.local conforme o guia de implantação.
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Use o endereço exato configurado em `APP_ORIGIN`. A rota `/admin` mostra o login quando não existe sessão. A confirmação de cadastro depende da conexão com o Supabase e da migração aplicada.

## Verificações

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm test` verifica a validação e executa a migração em PostgreSQL local descartável com PGlite. A estrutura de teste replica os metadados fornecidos, com papéis e sessões simulados no PostgreSQL. Os testes de navegador cobrem o formulário e as recusas reais do servidor sem credenciais. O painel autenticado é exercitado no navegador com respostas simuladas. O roteiro do guia cobre a homologação com o Supabase Auth e a Data API reais.

## Estrutura do código

| Pasta | Conteúdo |
| --- | --- |
| `src/app` | Rotas, APIs e estilos Tailwind CSS |
| `src/components` | Formulário público, login, painel e detalhes |
| `src/lib` | Validação compartilhada, tipos, sessão e integração Supabase |
| `supabase` | Inspeção, relatório, migração incremental e estrutura exclusiva de testes |
| `tests` | Testes de validação, banco e navegador |

O projeto usa Next.js com App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL e Supabase Auth. O [guia de implantação](docs/implantacao.md) detalha a configuração, o primeiro advogado, a publicação pelo GitHub e pela Vercel, a homologação e os backups.

