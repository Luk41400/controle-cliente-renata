O primeiro acesso será configurado no painel privado do Supabase do projeto `srvzdpkaqnxvydxinfco`. O procedimento associa uma conta do Supabase Auth ao perfil do advogado e deixa exatamente um perfil ativo com permissão `gestao`. Se já houver outros perfis, eles serão desativados. A execução é transacional e conserva o ID de um perfil já associado à conta escolhida.

O arquivo versionado deve permanecer como modelo vazio. Cópias operacionais preenchidas, quando necessárias, devem usar o sufixo `.local.sql`, ignorado pelo Git, e permanecer em ambiente privado.

Antes do login, confira em **Vercel → projeto controle-cliente-renata → Settings → Environment Variables → Production** as cinco variáveis do [guia de implantação](implantacao.md). `APP_ORIGIN` deve ter o valor `https://controle-cliente-renata.vercel.app`. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` devem corresponder ao projeto escolhido. `APP_HASH_SECRET` precisa ter pelo menos 32 caracteres aleatórios. Preencha os valores privados diretamente na Vercel e aplique as mudanças com um novo deployment. Se o login ou a consulta responderem 503, confira primeiro essas configurações. [Variáveis de ambiente da Vercel](https://vercel.com/docs/environment-variables)

1. Entre no [projeto correto no Supabase](https://supabase.com/dashboard/project/srvzdpkaqnxvydxinfco). Confira se a migração de segurança da aplicação já foi aplicada, conforme o [guia de implantação](implantacao.md). O script de primeiro acesso interrompe a execução se não encontrar a função de autorização ou se detectar RLS desativado.

2. Em **Authentication → Sign In / Providers**, mantenha o provedor de e-mail e senha habilitado e desligue **Allow new users to sign up** e o login anônimo. Assim, as novas contas serão criadas apenas pelos administradores autorizados no ambiente do Supabase. Essa configuração vale para o projeto Supabase inteiro, inclusive outras aplicações que o utilizem. [Configurações de autenticação](https://supabase.com/docs/guides/auth/general-configuration)

3. Em **Authentication → Users → Add user → Create new user**, informe o e-mail profissional do advogado e defina uma senha exclusiva no campo privado do painel. Confirme o e-mail pelo fluxo administrativo somente depois de verificar que o endereço pertence ao advogado autorizado. Use um gerenciador de senhas para guardá-la. Preencha a senha apenas nesse fluxo do Supabase. O SQL de autorização precisa somente do UUID e das informações de identificação. Se a conta já existir, selecione a conta correta e confirme que ela possui uma senha definida pelo fluxo privado do Auth. [Gerenciamento de usuários](https://supabase.com/docs/guides/auth/managing-user-data) · [Autenticação por senha](https://supabase.com/docs/guides/auth/passwords)

4. Copie o **User UID** dessa conta. Ele deve corresponder a `adv_advogados.auth_user_id`. A coluna `adv_advogados.id` é gerada pelo banco e identifica o perfil profissional usado nas observações e na auditoria.

5. Abra [primeiro-advogado.sql](../supabase/primeiro-advogado.sql), copie o modelo para uma nova consulta no **SQL Editor** do Supabase e preencha o bloco JSON **dentro desse editor**. Mantenha o arquivo local com os campos vazios. Preencha `auth_user_id`, `nome`, `oab_numero`, `oab_uf` e `email`. Preserve zeros à esquerda e sufixos da OAB. Digite a UF com a sigla válida do estado. O e-mail deve coincidir com a conta que você acabou de selecionar no Auth.

6. Execute a consulta inteira com sua conta administrativa do Supabase. O script confere o UUID, o e-mail confirmado e os conflitos de OAB ou e-mail. Em seguida, associa ou atualiza o perfil, atribui `permissao = gestao`, ativa a conta escolhida e desativa os outros perfis. O resultado final deve apresentar `advogados_ativos = 1` e `acesso_unico_configurado = true`. Uma validação ou conflito impede a confirmação de toda a transação. Se o editor deixar uma transação aberta após uma falha, execute `rollback;` antes de corrigir e tentar novamente.

7. Abra [a área administrativa](https://controle-cliente-renata.vercel.app/admin) e entre com a **OAB exatamente como foi cadastrada**, a **UF** e a **senha definida no Supabase**. O servidor resolve o e-mail internamente, verifica a senha com o Auth e verifica o perfil ativo. O painel deve carregar os cadastros existentes. Use somente consulta para esta verificação.

8. Teste uma senha incorreta e uma combinação de OAB e UF sem autorização. Ambas devem ser recusadas com uma mensagem genérica. Em uma janela anônima, abra `/admin` e confira a tela de login. A consulta administrativa sem sessão deve responder 401, conforme o comando abaixo. Uma resposta 503 indica indisponibilidade ou configuração pendente e precisa ser resolvida antes de considerar o primeiro login validado.

```powershell
curl.exe -i -X POST https://controle-cliente-renata.vercel.app/api/admin/clientes -H "Origin: https://controle-cliente-renata.vercel.app" -H "Content-Type: application/json" --data-raw '{"action":"listar","page":0}'
```

9. Para conferir o bloqueio de um usuário Auth sem autorização em ambiente de teste, crie uma conta sintética pelo administrador e mantenha seu perfil ausente ou inativo. Mesmo autenticada no Auth, essa conta deve receber zero registros pela RLS ou uma resposta de acesso negado pela Data API. Os testes automatizados do projeto exercitam esses cenários em PostgreSQL descartável, incluindo a perda de acesso de outros perfis após executar o procedimento.

A configuração de um único advogado depende de manter apenas esse perfil ativo em `adv_advogados`. Uma alteração administrativa posterior pode autorizar outra pessoa. Para suspender o acesso, desative o perfil no Supabase e encerre as sessões pelo procedimento administrativo do escritório. As políticas verificam o perfil ativo no banco em cada operação protegida.

Os testes locais verificam o SQL e as permissões com dados sintéticos. O teste positivo com a conta real deve ser concluído privadamente depois dos passos de criação e autorização. O cadastro da conta e o bloqueio de novas inscrições no Supabase dependem dessas ações no painel.
