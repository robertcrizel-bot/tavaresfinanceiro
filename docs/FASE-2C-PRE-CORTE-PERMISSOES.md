# Fase 2C — proteção de permissões antes do corte

**Status: preparação apenas. Não aplicado ao banco de produção nem publicado.**

## Não perder lançamentos

- A instalação de Fase 2C e o hardening antes do corte **não contêm DELETE, UPDATE ou TRUNCATE de dados de usuários** e não fazem limpeza de testes.
- Os 6 pagamentos legados sem transaction_id são preservados; a nova RPC se recusa a desfazê-los sem reconciliação.
- Não reutilizar backup de 16/10 como substituto do banco atual: produção já avançou para pelo menos 157 transações e 67 objetos no Storage (consulta somente leitura).
- Capturar backup/PITR novo imediatamente antes do corte, contagem e totais financeiros de referência; incluir novos objetos de Storage e point-in-time. O backup exportado e os 64 anexos do dia 16 não são a fotografia da produção atual.
- Se o ponto de recuperação não estiver verificado, **não avançar**.

## Ordem controlada e bloqueios

1. Combinada janela curta sem operações financeiras, aguardar requisições antigas terminarem. **Não instalar frontal antes do banco.**
2. Comparar migrations com o banco real e capturar contagens, totais e grants. Aplicar as três migrations originais Fase 2C em ordem (115000, 120000, 121000), somente após autorização específica.
3. Aplicar `20261016122000_phase2c_precutover_permissions.sql`. A migration só retira privilégios excessivos e acesso anônimo a RPCs antigas. **Preserva authenticated EXECUTE e DML normal para não quebrar a versão atualmente publicada.**
4. Publicar o frontend aprovado da branch `test/financial-phase2c-frontend` (ou merge **controlado** que incorpore apenas as alterações comprovadas). Garantir que o GitHub/Lovable tenham o mesmo commit; não disparar publicação do Lovable a partir de outra branch.
5. Após upgrade dos clientes, ensaiar separadamente a segunda fase, revogando authenticated EXECUTE nas três RPCs antigas de fechamento e bloqueando só os caminhos diretos que contornam operações atômicas. **Não executar esse bloqueio na migração pré-corte**: usuários com frontend antigo ainda precisam de compatibilidade. Sem esta segunda fase a proteção global contra bypass **não está completa**.
6. Validar uma operação de cada tipo, contagens, totais, grants, controle de versão e UUID de retry sem exibir dados pessoais. Liberar a janela.

**Contingência:** suspender novas operações, preservar UUIDs e histórico, conferir servidor antes de repetir, não apagar reservas ou transações. Não voltar às escritas antigas automaticamente. Para recuperação, restaurar primeiro isoladamente, reconciliar operações posteriores e arquivos e obter autorização explícita.

## Ensaios automatizados

Workflow `phase2c-supabase.yml`: ambiente Supabase descartável, 19 grupos de integração e 1.387 testes/frontend; adicionado `permissions.test.mjs`, que testa bloqueio de anon, compatibilidade com authenticated, ausência de TRUNCATE/REFERENCES/TRIGGER, INSERT/DELETE regular de teste e contagem preservada. Sem credenciais de produção.

**Observação**: não afirmar que esta preparação garante zerar duplicações em todos os caminhos antigos. O corte final deve ser validado separadamente antes de prometer proteção completa.
