# Diagnóstico das 15 pendências

Execute o arquivo inteiro [diagnosticar-15-pendencias.sql](../supabase/diagnosticar-15-pendencias.sql) no SQL Editor do projeto `srvzdpkaqnxvydxinfco`. Ele contém um único SELECT e retorna uma tabela com 15 linhas, incluindo as comparações que coincidirem com o esperado. As colunas `esperado` e `encontrado` são JSON. Expanda-as ou exporte o resultado para comparar os metadados completos. Não execute a migração enquanto houver divergência sem explicação.

A consulta lê apenas catálogos e configuração. Não consulta registros de clientes, contas Auth ou objetos de fotografias e não chama funções da aplicação. As definições SQL retornadas são metadados das 11 funções administrativas; a consulta não executa seus corpos. Nenhum GRANT, REVOKE, ALTER, INSERT, UPDATE ou DELETE é executado. Os comandos que aparecerem dentro de uma definição retornada são texto.

## Onze permissões de funções

A inspeção anterior exigia `anon=false`, `authenticated=true` e `service_role=false` para EXECUTE nessas 11 RPCs públicas invoker. As migrações anteriores retiram os acessos de PUBLIC/anon e autorizam authenticated, mas não retiram os grants existentes de service_role nessas funções. Projetos Supabase podem ter defaults que concedem EXECUTE ao papel de serviço em funções novas de `public`. [Grants e defaults no Supabase](https://supabase.com/docs/guides/api/securing-your-api)

O diagnóstico apresenta os privilégios efetivos com `has_function_privilege`, ACL armazenada, grants de PUBLIC, grants diretos, papéis herdados com EXECUTE, proprietário, configuração e definição completa. Os defaults atuais ajudam a investigar, mas não comprovam a origem histórica de um grant. BYPASSRLS não equivale a EXECUTE. [Privilégios efetivos e pertencimento a papéis](https://www.postgresql.org/docs/current/functions-info.html)

`POSSIVEL_FALSO_POSITIVO_SERVICE_ROLE` significa que a divergência de ACL está apenas no acesso do papel confiável do backend, a função continua invoker e os papéis do navegador passaram pelas verificações de isolamento. Não significa aprovação automática de seu corpo. `DIVERGENCIA_RELEVANTE` exige revisão: por exemplo, acesso anônimo, falta de acesso authenticated, SECURITY DEFINER inesperado ou papéis do navegador com poderes indevidos. Não use REVOKE apenas para eliminar uma diferença do relatório.

A inspeção e a verificação preventiva da migração foram ajustadas para aceitar service_role com ou sem EXECUTE somente nessas 11 RPCs públicas invoker. As verificações separadas de assinatura/retorno, isolamento dos papéis e funções privilegiadas continuam presentes. As RPCs de cadastro, limitação e limpeza continuam exclusivas do servidor; nenhuma permissão de produção foi alterada.

## Três políticas restritivas

| Política | Tabela | Comando | Referência externa esperada |
| --- | --- | --- | --- |
| `renata_auditoria_cliente_visivel` | `public.adv_auditoria` | SELECT | `public.adv_clientes` |
| `renata_observacao_cliente_visivel` | `public.adv_observacoes` | ALL | `public.adv_clientes` |
| `renata_restringir_observacoes_insercao` | `public.adv_observacoes` | INSERT | `public.adv_advogados` |

Todas devem ser RESTRICTIVE, aplicadas a authenticated, com RLS habilitado na tabela. O relatório compara USING, WITH CHECK, comando, papéis e relações realmente referenciadas por OID. O alvo da própria política não aparece na lista de referências externas.

O deparser do PostgreSQL pode apresentar `FROM adv_clientes` ou `FROM public.adv_clientes` conforme o search_path da sessão. `POSSIVEL_FALSO_POSITIVO_REPRESENTACAO` indica igualdade após normalizar apenas essas qualificações conhecidas e espaços, com dependências corretas. Não se removem parênteses, condições, operadores ou casts para forçar igualdade. Uma tabela homônima em outro schema continua bloqueada, mesmo se o texto exibido for idêntico. A definição completa está disponível para revisão.

## Data API

Abra [as configurações Data API deste projeto](https://supabase.com/dashboard/project/srvzdpkaqnxvydxinfco/integrations/data_api/settings). No menu: **Integrations → Data API → Settings → Exposed schemas**. Confirme que `renata_privado` está ausente da lista; `public` deve continuar exposto para as RPCs atuais. Faça somente a conferência neste momento, sem salvar alterações de configuração.

O parâmetro `pgrst.db_schemas` pode não estar disponível no SQL Editor. Sua ausência gera `CONFERENCIA_MANUAL_NO_PAINEL`, não comprova exposição. Mesmo quando houver um valor na sessão SQL, confirme o painel: a sessão do editor não prova, sozinha, a configuração efetiva do processo PostgREST.

## Resultado necessário antes de continuar

Envie o resultado dessas 15 comparações e a confirmação visual de que `renata_privado` não está em Exposed schemas. Revise os metadados antes de compartilhar e não inclua senhas, tokens, chaves ou cadastros. Os testes locais reproduzem defaults, herança, PUBLIC e diferenças de deparser, mas não confirmam o estado do banco hospedado. Merge e deploy permanecem suspensos até concluir essa análise. Não reaplique migrações nem altere políticas ou permissões para tentar fazer o relatório passar.
