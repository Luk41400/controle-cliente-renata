# Configuração e implantação

## 1. Conferir o Supabase existente

Use o projeto de referência `srvzdpkaqnxvydxinfco`, identificado no relatório como `Aula03/08/2026`. O nome de exibição pode ser alterado para `controle-cliente-renata` nas configurações do projeto. A aplicação usa a URL do projeto e a referência continua a mesma.

1. Compare o [relatório de metadados](../supabase/resultado-inspecao.md) com uma execução atual de [inspecionar.sql](../supabase/inspecionar.sql) no SQL Editor. A inspeção consulta apenas os catálogos.
2. Revise também triggers, views e funções legadas que referenciem as tabelas `adv_*`, especialmente se houver funções privilegiadas ou views com acesso amplo. Confirme que nenhum fluxo externo depende de permissões que a migração restringe.
3. Faça backup e valide a restauração em um banco isolado. Para um Supabase de teste vazio, crie a estrutura com [estrutura.sql](../supabase/testes/estrutura.sql). Use esse arquivo somente em teste.
4. Execute a [migração incremental](../supabase/migrations/20261106223752_adv_protecao_e_operacoes.sql) no SQL Editor do ambiente de teste primeiro. A migração é transacional e usa as quatro tabelas existentes. Depois da homologação, aplique o mesmo arquivo uma vez no projeto escolhido, na janela autorizada. Aplique pelo SQL Editor ou pelo fluxo de migrações da equipe, usando apenas um deles para o mesmo ambiente.
5. Em **Integrations → Data API**, confira se `public` está exposto e `renata_privado` permanece fora da Data API. A migração concede acesso por coluna aos advogados autenticados sob RLS e acesso às RPCs de cadastro e de limitação ao papel de serviço. Confira novamente os privilégios e rode o Security Advisor do Supabase.

A migração aproveita `adv_clientes.nome`, os códigos `novo`, `em_andamento` e `concluido`, e a relação entre `adv_advogados.auth_user_id` e `auth.users.id`. Acrescenta os perfis `consulta` e `gestao`, com consulta como padrão e novas autorizações inicialmente inativas. Preserva o valor de `ativo` dos perfis existentes. As observações e a auditoria continuam vinculadas a `adv_advogados.id`. A auditoria passa a aceitar autor nulo para o cadastro público e armazena nomes de campos alterados e transições de status. A migração também adiciona autoria histórica a partir dos vínculos existentes, atualiza `atualizado_em` nas alterações e cria índices para busca parcial e idempotência. As informações já cadastradas permanecem nas tabelas originais.

Referências do Supabase para [proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api) e [políticas RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 2. Configurar as variáveis

Localmente, copie `.env.example` para `.env.local` e preencha o arquivo. Na Vercel, configure as mesmas variáveis em **Settings → Environment Variables**.

| Variável | Valor |
| --- | --- |
| `APP_ORIGIN` | Origem exata que o navegador usará, como `http://localhost:3000` localmente ou `https://controle-cliente-renata.vercel.app` se esse domínio estiver disponível. |
| `SUPABASE_URL` | Project URL do ambiente. Para produção, confira a referência `srvzdpkaqnxvydxinfco`. |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto, obtida em **Settings → API Keys**. Nesta aplicação fica configurada no servidor. |
| `SUPABASE_SECRET_KEY` | Chave secreta do mesmo projeto, usada pelo servidor para resolver o login e gravar cadastros públicos. Configure como segredo na Vercel. |
| `APP_HASH_SECRET` | Valor aleatório exclusivo por ambiente, com pelo menos 32 caracteres. Use 32 bytes aleatórios codificados em hexadecimal. Configure como segredo na Vercel. |

Para gerar o segredo de hash na sua máquina, execute o comando abaixo e use o resultado apenas no arquivo local ignorado pelo Git ou no cofre de variáveis da Vercel.

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mantenha ambientes de preview e desenvolvimento isolados do banco de produção. Configure uma origem estável para o preview que será homologado. Após alterar variáveis na Vercel, faça um novo deployment autorizado para aplicar os valores. [Variáveis da Vercel](https://vercel.com/docs/environment-variables) · [Chaves de API do Supabase](https://supabase.com/docs/guides/api/api-keys)

## 3. Cadastrar o primeiro advogado

1. No Supabase, confirme que o provedor de e-mail e senha está habilitado. Em **Authentication**, desabilite novos cadastros públicos e login anônimo para este projeto. Se houver outras aplicações no projeto, valide o impacto dessa configuração antes da mudança.
2. Como administrador do projeto, crie a conta em **Authentication → Users**. Use um e-mail profissional que o advogado controle e defina uma senha exclusiva e forte no fluxo administrativo do Supabase. Trate a entrega inicial ou redefinição por canal seguro do escritório. Confirme o usuário conforme o procedimento do escritório.
3. Copie o UUID dessa conta. Em **Table Editor → adv_advogados**, insira uma linha e deixe o próprio banco gerar `id` e `criado_em`.
4. Preencha `auth_user_id` com o UUID de **Authentication → Users**, `email_login` com o mesmo e-mail, `nome`, `oab_numero` conforme a inscrição que será digitada e `oab_uf` com a sigla em maiúsculas. Preserve zeros à esquerda e sufixos. O login compara o número como foi cadastrado, ignorando espaços nas extremidades da entrada.
5. Escolha `permissao = gestao` para editar, alterar status e adicionar observações, ou `permissao = consulta` para somente leitura. Marque `ativo = true` quando autorizar a pessoa.
6. Abra `/admin` e entre com OAB, UF e senha. Se mudar o e-mail no Supabase Auth, atualize `email_login` para manter a associação. Para suspender acesso, marque `ativo = false` e revogue as sessões da conta pelo procedimento do escritório. A aplicação verifica a sessão e o perfil no banco a cada operação.

A autenticação usa o ciclo de renovação do Supabase Auth e aplica um limite absoluto de sete dias à sessão. Cookies administrativos são HttpOnly e, em HTTPS, Secure. O cadastro tem limite por IP e o login tem limites por IP, por conta e por combinação dos dois. O servidor usa o IP informado pela infraestrutura da Vercel e guarda identificadores HMAC para os limites. [Sessões do Supabase](https://supabase.com/docs/guides/auth/sessions) · [Cabeçalhos da Vercel](https://vercel.com/docs/headers/request-headers)

## 4. Versionar no GitHub e publicar na Vercel

1. Crie um repositório privado e vazio no GitHub. Na pasta do projeto, rode os comandos abaixo, substituindo o exemplo pela URL do seu repositório.

```powershell
git init -b main
git add .
git status --short
git commit -m "Implementa Controle Cliente Renata"
git remote add origin https://github.com/ORGANIZACAO/REPOSITORIO.git
git push -u origin main
```

Antes do commit, confirme que `.env.local`, dumps e relatórios com dados reais ficaram fora do stage. O `.env.example` e o relatório de estrutura sem registros podem ser versionados.

2. Depois da autorização do escritório, importe o repositório na Vercel como um projeto Next.js, com raiz no diretório do `package.json` e Node.js 24. Configure as variáveis do ambiente de homologação. A integração Git pode disparar deployments automaticamente, portanto conecte-a apenas quando esse comportamento estiver autorizado.
3. Homologue o preview protegido usando um Supabase de teste. Quando o escritório aprovar a publicação, configure as variáveis de produção, selecione o domínio e confirme que `APP_ORIGIN` corresponde a ele. As três rotas usam o mesmo domínio e a Vercel fornece HTTPS.

[GitHub na Vercel](https://vercel.com/docs/git/vercel-for-github)

## 5. Roteiro de homologação

Use apenas dados sintéticos e contas de teste em um ambiente isolado.

1. Em um navegador e em um celular, envie o formulário com CPF inválido e confirme a mensagem no campo. Envie um CPF sintético válido e confirme a gravação pelo painel, a mensagem de sucesso e a limpeza dos campos. Reenvie a mesma requisição de teste com o mesmo identificador e confirme que há um único cadastro.
2. Em janela anônima, confirme que `/admin` oferece login e a API administrativa retorna 401 sem sessão. Com a chave publicável sem JWT de advogado, confira que a Data API bloqueia SELECT e INSERT nas quatro tabelas.
3. Teste OAB, UF e senha corretas, senha incorreta e o bloqueio de tentativas excessivas. Entre como advogado ativo, desative-o pelo Supabase e confirme que a próxima operação protegida rejeita a sessão. Teste novamente com um perfil de consulta e confirme que a edição é recusada.
4. Cadastre mais de 12 registros sintéticos para exercitar paginação. Confira os totais e a busca parcial, a ordem por nome e por data, o filtro de status e o período em horário de São Paulo.
5. Abra o detalhe e compare os nove campos, o relato completo, a data e o status. Edite uma informação, altere o status e grave uma observação. Confira a autoria, as datas e o histórico. Abra a mesma ficha em duas sessões e confirme que a segunda tentativa de salvar uma versão antiga pede atualização.
6. Saia e entre novamente, verificando a persistência. Após sair, confirme que as APIs privadas voltam a retornar 401. Confira no navegador que os retornos privados têm `Cache-Control: no-store`, que não há dados de clientes ou termos de busca nas URLs e que o navegador recebe apenas cookies de sessão HttpOnly.
7. Após publicar em produção, valide HTTPS, a política aprovada, a abertura da tela de login e o bloqueio sem sessão. Deixe os testes com registros fictícios no ambiente de homologação.

## 6. Privacidade, retenção e backups

- Revise a [minuta editável](../src/app/privacidade/page.tsx) e preencha a identidade e o contato do controlador, as bases legais, os operadores, os prazos e as informações sobre compartilhamento ou transferência antes de coletar dados de clientes reais.
- Defina com o escritório prazos por categoria de dado e regras de preservação para casos sujeitos a obrigações legais ou profissionais. Verifique identidade, autorização e vínculos antes de uma exclusão. A interface oferece consulta e atualização. A exclusão autorizada deve seguir procedimento operacional do escritório, com conferência dos efeitos sobre observações, auditoria e backups.
- Em **Database → Backups**, confira a cobertura e a retenção do plano. Estabeleça periodicidade conforme a perda aceitável de dados e use PITR quando necessário e disponível. Se fizer cópias lógicas, use um destino criptografado, controle de acesso e prazo de expiração. Documente a recuperação de Auth e dos perfis, e teste restaurações isoladas periodicamente.
- Restrinja acessos ao Supabase, à Vercel e ao GitHub. Evite ferramentas que capturem corpo de requisição, cookies, formulários ou sessões gravadas. Faça a revisão de segurança e privacidade do escritório antes de aceitar atendimentos reais.

[Backups do Supabase](https://supabase.com/docs/guides/platform/backups) · [Direitos dos titulares segundo a ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
