# Auditoria Beta do FinVision (somente leitura)

## O que vi no banco real
- **Chave do Beta (`beta_access_switch`)**: existe e está **ATIVA** (`enabled = true`) desde 23/10/2026. Então só entra quem tem acesso válido.
- **Acessos (`beta_entitlements`)**: existe. Tem 2 acessos `trial`, os 2 válidos hoje. Não verifiquei de quem são.
- **Pedidos (`beta_access_requests`)**: existe. Tem 1 pedido `pending`, de 02/11/2026.
- **Função `beta_has_access`**: existe. Sem login, nega. Com a chave ligada, exige acesso `active`/`trial` dentro da validade. Um gatilho impede ligar a chave quando não há nenhum acesso válido.
- **Proteção dos dados**: todas as 13 tabelas do app têm proteção por usuário ligada. As tabelas financeiras e de anexos têm ainda a regra extra `beta_paid_access`, que obriga o acesso Beta.
- O usuário logado não consegue ler nem alterar a chave e os acessos. Nos pedidos, só pode criar e ler o próprio, sempre com status `pending`.
- **Comprovantes**: ficam numa pasta privada. Cada pessoa só lê, envia e apaga o que está na própria pasta, e só com acesso Beta.

## O que não existe
- Não há tela de administração para ver pedidos ou conceder acesso. No código, só o bloqueio do Beta (`BetaAccessGate`) usa essas tabelas.
- Não há cargo de administrador.

## Caminho mais curto para o 1º testador, sem pagamento
1. O testador cria a conta (email ou Google) e pede acesso na tela do Beta.
2. O proprietário me autoriza **explicitamente**, nesta conversa, a conceder `trial` a esse pedido, dizendo o email e a validade (ex.: 30 dias).
3. Eu insiro o acesso direto no banco. Não precisa mudar código.
4. O testador recarrega o app e entra.

Repetir para 2 a 5 pessoas. Ter uma tela de admin é opcional e fica para depois.

## Depende do proprietário
- Autorizar cada concessão e dizer quem e por quanto tempo. Hoje, eu não altero acessos sem esse pedido.
- Confirmar se o pedido pendente é de alguém que você quer liberar.

## Não verifiquei
- A quem pertencem os 2 acessos e o pedido. Não li os usuários nem divulgo IDs.
- Se a tela do Beta mostra o botão de pedir acesso no publicado.
- Os 2 backups antigos guardados (privados). Vale apagar depois.
