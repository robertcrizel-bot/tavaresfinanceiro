# FinanceControl — Fase 2C: backup, restauração e corte com segurança
Status: **BLOQUEADO PARA PUBLICAÇÃO** até existir um export NOVO e uma restauração isolada efetivamente verificada.

## Foto da produção (22/10/2026; SELECTs somente leitura)

- Base de código publicada: `61ff14e1acd62377b2247ba4f59c09cc9f1644cb`.
- Fase 2C candidata: PR #11, branch `integration/phase2c-safe-rebase-20261022`. CI: 1.392 testes, TypeScript, build, SQL/Auth/PostgREST/RLS em ambiente efêmero. Reaplicação da constraint existente aprovada.
- DB: 161 transações; 28 previsões; 27 pagamentos; 6 pagamentos legados com `transaction_id IS NULL`; 6 faturas. Totais no dia da consulta: receitas 56.380,00; despesas 23.078,75 (revalidar na janela).
- 70 registros `transaction_attachments`; 71 arquivos no bucket privado `transaction-attachments`, 139.504.238 bytes (~133 MiB). 14 registros de anexos referem-se a transações hoje ausentes; 1 arquivo não tem metadados; **nenhuma limpeza autorizada**. Dados pessoais dos recibos não foram lidos.
- Único export independente localizado no Storage da produção: bucket `database_export_16_10_26`, 1 arquivo (511.623 bytes) criado em 16/10. **Antigo e insuficiente** para este corte.
- As três RPCs atômicas ainda não existem na produção, e `credit_card_invoices.operation_version` também não existe. Defesas antiduplos estão ativas.
- Não há acesso automatizado, pelos conectores disponíveis, à lista de snapshots diários nem ao botão Export data do Lovable. Logo, NÃO foi confirmado que exista snapshot diário utilizável ou capacidade de export atual.
- Os checks não são um backup, não verificam a recuperabilidade de fotos nem garantem dados que surgirem depois do instante consultado.

## Passo A — ação no Lovable, sem alterar dados

1. Abra o projeto FinanceControl no Lovable; selecione **More → Database → Manage → Backups**. **Somente anote/fotografe a data UTC do backup mais recente. NUNCA clique Restore.**
2. Na mesma área, **More → Database → Manage → Settings → Export project data → Export data → Database → Export → Start export**. É uma operação de backup, não restauração. A documentação atual informa limite de 1 export a cada 24h.
3. Quando o Lovable notificar que terminou, baixe o arquivo do banco em **More → Storage** e guarde uma cópia fora do Lovable, preferencialmente em disco local protegido. Este arquivo contém dados pessoais, contas de usuários e hashes de senha — não publicar no GitHub, chats, links públicos ou ferramentas de diagnóstico.
4. Baixe também **todos os objetos de `transaction-attachments`**, preservando pastas e nomes. Os backups/export do Lovable **não incluem Storage**. O total observado foi 71 arquivos (139.504.238 bytes), mas recontar ao iniciar a janela.

Referência oficial: https://docs.lovable.dev/features/database-backups

## Passo B — teste de restauração (NÃO na produção)

1. Criar um projeto Supabase/local isolado com PostgreSQL compatível e extensões necessárias. **Jamais usar as credenciais/URL do banco ativo como destino.**
2. Inspecionar o arquivo `pg_restore --list`, sem confundir listagem válida com restauração validada.
3. Restaurar o export completo no banco isolado; conferir schemas de dados e auth, tipos, triggers, grants e FKs. Não copiar chaves, segredos de produção, webhook nem alterar o projeto Lovable atual.
4. Comparar, entre export e produção na hora do corte, contagens/totais do `scripts/phase2c/preflight-readonly.sql`. Validar os 6 pagamentos legados, 14 metadados órfãos e 1 arquivo sem metadata **sem apagá-los**.
5. Conferir as 71 fotos/PDFs independentes pelo manifesto de nomes, tamanhos e hashes em pasta privada. Verificar abertura de amostras SEM expor imagens nos logs.
6. Registrar claramente se o export é restaurável, data de corte, hash SHA-256 do arquivo e horários observados; se alguma parte falhar, parar.

## Passo C — última autorização de implantação

Pré-condições **todas obrigatórias**:
- [ ] Export **atual** do banco salvo fora do Lovable e com hash verificado.
- [ ] Cópia dos comprovantes salva fora do Lovable e comparada com o manifesto.
- [ ] Restauração de teste completa comprovada, incluindo perfis/auth e vínculos.
- [ ] Janela de testes sem novos lançamentos combinada (para totais não variarem entre medições).
- [ ] Verificação das 6 ligações de pagamentos antigas, sem reconciliação automática.
- [ ] PR #11 no SHA aprovado e CI verde, sem outras alterações de código.
- [ ] Usuário aprova explicitamente a migração/merge/deploy após revisar resultados.

Sequência prevista: capturar preflight SELECT → migrations 1150, 1200, 1210, 1220 na ordem (respeitar proteção do Lovable; não contornar bloqueios) → executar postflight SELECT e version check → só então merge/deploy frontend aprovado → verificar uso no Moto G32.

**Se ocorrer erro:** congelar novas operações, preservar logs e IDs de intenção, investigar. Não restaurar snapshot antigo por cima da produção, pois descartaria novas operações. Não deletar/ajustar recibos órfãos como parte do corte.

## O que já está pronto

- CI completo de frontend e banco efêmero aprovado.
- Conflitos de integração resolvidos preservando a trava contra duplicidade.
- A migração inicial tornou-se reexecutável sem recriar constraint existente; ensaio em banco povoado foi aprovado.
- SQL de conferência pré e pós-corte `scripts/phase2c/preflight-readonly.sql` criado, somente com SELECTs.
- **Nenhuma migração 2C ou publicação executada na produção durante este preparo.**
