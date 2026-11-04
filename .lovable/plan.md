# Ativar login com Google (Lovable Cloud)

## Diagnóstico (confirmado)
- O backend deste projeto é o Lovable Cloud (o mesmo endereço de autenticação citado). Ele é gerenciado pelo Lovable: não é preciso — nem possível — entrar em painel externo.
- O erro "provider is not enabled" aparece nos registros de login de hoje (17:33 UTC): o provedor Google simplesmente nunca foi ativado.
- O botão atual chama o login do Google pelo caminho antigo/direto; no Lovable Cloud o caminho correto é o módulo gerenciado do Lovable (que ainda não existe no projeto).

## O que posso fazer automaticamente (após aprovação)
1. Ativar o Google com as credenciais gerenciadas do Lovable (ferramenta de Login Social). Isso gera o módulo de login gerenciado e instala o pacote necessário.
2. Trocar só a função de login com Google do `AuthContext` para usar o módulo gerenciado, retornando para a página inicial do app.
3. Não mexer no email/senha, nas contas existentes nem na verificação `beta_has_access` (o portão beta continua igual após o login).
4. Testar no preview que o botão abre o Google sem o erro 400.

## O que exige você
- Clicar em entrar com sua conta Google para confirmar o fluxo completo (não consigo concluir login real no Google).
- Publicar depois, para valer em finvision2026.lovable.app.
- Opcional: usar credenciais Google próprias (marca própria na tela de consentimento) em Cloud → Usuários → Configurações de autenticação → Métodos de login → Google.

## Contas existentes
Quem entrar com Google usando o mesmo email já cadastrado (ex.: email verificado) é vinculado à mesma conta; o acesso beta continua valendo por usuário.
