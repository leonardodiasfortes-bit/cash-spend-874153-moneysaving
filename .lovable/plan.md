## Objetivo
Tornar `leonardo.dias.fortes@gmail.com` administrador, criando a estrutura segura padrão de papéis (roles) no banco.

## Passos

1. **Migração SQL** (uma única migração):
   - Criar enum `public.app_role` com valores `admin`, `moderator`, `user`.
   - Criar tabela `public.user_roles` (user_id → auth.users, role app_role, unique(user_id, role)).
   - GRANTs: `select` para `authenticated`, `all` para `service_role`.
   - Ativar RLS e criar policies:
     - Usuário pode ver seus próprios papéis.
     - Admin pode ver/gerenciar todos (usando `has_role`).
   - Criar função `public.has_role(_user_id uuid, _role app_role)` como `SECURITY DEFINER` (evita recursão de RLS).
   - Inserir registro `admin` para o `user_id` correspondente ao e-mail `leonardo.dias.fortes@gmail.com` (busca em `auth.users` dentro do mesmo script).

2. **Sem mudanças de UI nesta etapa.** A estrutura fica pronta para, no futuro, gatear telas/admin panel via `has_role(auth.uid(), 'admin')`.

## Detalhes técnicos
- Papéis ficam em tabela separada (nunca em `profiles`) para prevenir privilege escalation.
- `has_role` é `SECURITY DEFINER` + `SET search_path = public` para uso seguro dentro de policies sem recursão.
- A atribuição inicial é feita via `INSERT ... SELECT id FROM auth.users WHERE email = '...'` na própria migração.

## Como conceder admin a outros no futuro
Inserir uma linha em `user_roles` com `role = 'admin'` para o `user_id` desejado (posso fazer isso sob demanda, ou construímos um painel admin depois).