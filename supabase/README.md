# Banco de dados do SorteSenai (Supabase / Postgres)

## Regra principal
O navegador **nunca escreve** nas tabelas. Toda ação (roletar, comprar, jogar, editar perfil, admin)
é uma função no servidor (`supabase.rpc('nome')`) que confere convite, saldo e regras.
A sorte usa aleatoriedade criptográfica do banco, e cartas que o jogador não tem
nunca têm a piada enviada ao navegador.

## Arquivos
| Arquivo | O que tem |
|---|---|
| `migrations/..._schema.sql` | tabelas |
| `migrations/..._security.sql` | convite, RLS, `my_session()` (primeiro login) |
| `migrations/..._economy.sql` | roletar, coleção, bônus diário, reciclar, loja, títulos, perfil, mural, ranking |
| `migrations/..._games.sql` | caça-níquel, memória, reflexo, clique rápido (com limite diário) |
| `migrations/..._admin.sql` | painel admin, configurações padrão, storage, realtime do mural |
| `seed.sql` | cartas `[exemplo]`, poções e títulos |
| `tests/` | testes que rodam num Postgres local |

## Testar no seu PC
```bash
bash supabase/tests/run.sh
```
Precisa do PostgreSQL 15+ instalado (usa `C:\Program Files\PostgreSQL\16\bin` por padrão; mude com `PG_BIN=`).

## Subir no Supabase
1. Crie um projeto em supabase.com.
2. Em **Authentication → Providers**, ligue **Google** (crie a credencial OAuth no Google Cloud e cole o Client ID e o Secret).
3. Rode as migrações em ordem e depois o `seed.sql` (pelo **SQL Editor** ou com `supabase db push`).
4. Convide a turma:
   ```sql
   insert into public.allowed_emails (email) values ('seu.email@gmail.com'), ('amigo@gmail.com');
   ```
5. Entre no site uma vez com sua conta Google e vire admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'seu.email@gmail.com';
   ```
   Depois disso os convites e o resto se fazem pelo painel Admin.

## Códigos de erro
As funções falham com estas mensagens, que o frontend traduz:
`not_authenticated`, `not_invited`, `banned`, `forbidden`, `invalid`, `not_found`,
`insufficient_coins`, `already_claimed`, `nickname_taken`, `session_expired`.
