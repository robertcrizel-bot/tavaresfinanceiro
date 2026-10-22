# Fase 2C — pacote para revisão final, sem implantação

Base publicada: `26980125c7e450dc176e8eeaf47f76666f481a27`.
Base de banco validada: branch `test/financial-phase2c-supabase`, `9851801`.
Novo worktree: `.worktrees/financial-phase2c-frontend`.
Nova branch: `test/financial-phase2c-frontend`.

## Evidência anterior

[CI de banco aprovado](https://github.com/robertcrizel-bot/tavaresfinanceiro/actions/runs/38921790562),
commit de código `fc67501`: 16 grupos em PostgreSQL, Auth, PostgREST e RLS reais.
`9851801` acrescentou somente documentação. Nenhuma migration foi aplicada em produção.

## Auditoria de produção — somente leitura

Executada em 2026-10-16 pelo conector autorizado do projeto. Todas as consultas
foram SELECT de catálogo ou indicadores booleanos agregados. Não foram
extraídos identificadores de usuários/lançamentos, nomes, descrições, valores,
saldos, credenciais ou registros individuais. Não houve escrita, DDL, limpeza,
backup, migração, autenticação como usuário real ou chamada de RPC financeira.

Resultados no momento das consultas:

- `recurring_bills.type` já existe como text NOT NULL, com CHECK income/expense.
  Não foram encontrados tipos base desconhecidos. A migration aditiva mantém
  essa coluna e os valores existentes; não infere nem preenche classificações.
- **Há pagamentos legados com transaction_id NULL.** As novas operações recusam
  desfazer esses pagamentos sem reconciliação explícita. Isso permanece uma
  pendência para implantação, não uma autorização para apagar ou reparar dados.
- Não foram detectados vínculos compartilhados, pagamentos de dono divergente,
  competências inválidas ou conta/cartão/fatura de outro dono nos critérios auditados.
- Não foram detectadas divergências de dono de fatura, obrigação positiva
  inválida, pagamento positivo inválido ou total fechado divergente das compras.
  Não foi comparado saldo bancário externo, nem certificada toda a história financeira.
- UNIQUE de previsão/competência e FKs CASCADE/SET NULL correspondem ao desenho.
  As tabelas financeiras auditadas estão com RLS habilitada e políticas por auth.uid().
- As três RPCs novas, `financial_private` e `operation_version` ainda não existem.
  Não apareceu colisão com os objetos novos. O frontend novo não deve ser
  publicado antes das migrations e da verificação de versão.
- Corpos normalizados de assign/protect/cleanup/reconcile e das três sobrecargas
  existentes de fechamento têm os mesmos hashes das migrations locais pertinentes.
  Os triggers financeiros correspondentes estão habilitados.
- Existem grants amplos a anon/authenticated, inclusive TRUNCATE/REFERENCES/TRIGGER,
  e EXECUTE de anon nas sobrecargas antigas. RLS não substitui revisar esses grants.
  A RPC antiga de dois parâmetros ainda tem EXECUTE de PUBLIC. Não foram
  executados comandos privilegiados para testar esses grants no banco real.

Compatibilidade estrutural dos objetos inspecionados é favorável à migração
aditiva; **liberação de produção segue condicionada** à reconciliação legada,
backup testado, política de permissões e aprovação da janela. A auditoria não
abrange extensões, limites operacionais ou todos os objetos do projeto, nem
constitui snapshot transacional único entre todas as consultas.

## Frontend preparado

- Marcar/desmarcar usa uma RPC por intenção; não há INSERT/DELETE separados
  de transação e vínculo nesses fluxos.
- Restaurar e fechar usa `close_credit_card_invoice_atomic`, listas normalizadas
  e a versão carregada da fatura; não há UPDATE anterior de restauração.
- UUID, escopo, parâmetros exatos e usuário são persistidos em localStorage antes
  do envio. Um erro de transporte, timeout, deadlock ou confirmação inválida
  mantém a intenção; retry/recarga reutiliza UUID e parâmetros originais.
- O resultado precisa satisfazer o contrato antes de liberar a intenção. Erros
  SQL que confirmam rejeição/rollback permitem corrigir parâmetros com nova chave.
- Providers retomam intenções ao montar; a notificação oferece **Confirmar pendentes**
  quando necessário. Mesmo que o registro tenha desaparecido após refetch, a
  recuperação usa a requisição persistida, e não tenta reconstruí-la pelo snapshot.
- Web Locks serializa abas; falta de lock ou de persistência impede enviar a
  operação. Exige navegador atualizado em contexto seguro. Requests são separados
  por usuário e a sessão é conferida novamente antes do envio.
- localStorage armazena parâmetros financeiros necessários ao retry no dispositivo.
  Não registrar esse conteúdo em logs/telemetria, não apagar intenções pendentes
  no logout e não compartilhar o perfil do navegador. Limpar dados do navegador
  pode perder a chave; nesse caso, reconciliar antes de gerar nova intenção.
- O cliente mantém refetch e bloqueios locais. Reabrir/pagar/estornar e os fluxos
  de registros gerais continuam com seus contratos anteriores.

## Testes do pacote

Testes locais: 1.387 testes em 78 arquivos; TypeScript app/node aprovados.
A suíte inclui testes de providers, persistência, remontagem, parâmetros
incompatíveis, usuário diferente, versão original e armazenamento indisponível.

O workflow da nova branch executa a suíte completa, TypeScript, build e o
Supabase completo descartável. A suíte real importa o mesmo executor de
intenções usado pelo frontend e acrescenta três casos: resposta HTTP perdida
após commit de marcar, desmarcar e fechar, seguida de recuperação/reload.
Não usa o bootstrap PostgreSQL com mocks nem arquivos de ambiente de produção.

**Resultado final aprovado:** [CI completo](https://github.com/robertcrizel-bot/tavaresfinanceiro/actions/runs/38925659893),
commit de código `12098e460d8384c479d18b1d6b2bf70f75f49397`.
19 grupos reais de integração, 1.387 testes/78 arquivos, TypeScript app/node
e build aprovados. Build também passou localmente; revisão de diff aprovada.
Avisos preexistentes de act(), React Router, Browserslist, externalização de
módulos Node/OpenCV e tamanho de chunks não impediram a validação.
Este registro posterior modifica somente documentação e não repete os testes
de código já aprovados.

## Sequência proposta — ainda exige autorização

1. Aprovar este pacote e uma janela de manutenção. Confirmar novamente esquema,
   migrations e condições de corrida; a auditoria atual não é um lock de produção.
2. Criar backup consistente/PITR e exportar definições/grants. **Testar restauração**
   isoladamente; documentar ponto de recuperação e movimentos posteriores.
3. Autorizar plano de reconciliação para pagamentos sem vínculo: análise restrita
   por ID, evidência e decisão explícita. Nunca inferir lançamento por nome/valor/data.
   Não incluir dados pessoais no relatório ou em artefatos públicos de CI.
4. Ensaiar o pacote e a preservação dos dados/grants atuais em clone autorizado.
   Aplicar migrations aditivas somente após aprovação e conferir funções/permissões.
5. Publicar frontend em rollout controlado após confirmar contratos e versão de
   fatura. UUIDs não expiram enquanto houver possibilidade de replay. Observar
   conflitos, falhas, reservas e invariantes sem registrar dados pessoais.
6. Após migrar os clientes, restringir grants perigosos, sobrecargas antigas e
   caminhos de escrita que possam quebrar vínculos. **Não revogar toda escrita
   em transactions indiscriminadamente:** registros comuns ainda dependem dela.
   Elaborar políticas/triggers específicos e testar compatibilidade antes de aplicar.
7. Se falhar: pausar novas intenções/rollout, preservar chaves e histórico, conferir
   resultado confirmado no servidor antes de repetir ou compensar. Não retornar
   ao frontend antigo com escritas separadas como recuperação automática; preferir
   suspender esses fluxos. Não remover schema/colunas ou apagar reservas já usadas.
   Recuperação por backup/PITR deve ser ensaiada isoladamente e aprovada considerando
   movimentos posteriores antes de trocar o ambiente real.

Nenhuma etapa deste plano é autoautorizada. A reconciliação e a revisão de
permissões seguem como pendências explícitas. Não houve merge, deploy, alteração
de Gemma/câmera/Workers ou modificação do banco real neste trabalho.
