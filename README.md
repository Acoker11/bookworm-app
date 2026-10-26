# BookWorm

BookWorm is a Netflix-style book browsing app. Anyone can browse books (home, title search, six genres, book details) and read other readers' logs. Signed-in users can build a private library, track reading status, and write logs with an optional 1-5 rating.

**Live app:** https://bookworm-app-eight.vercel.app

The original assignment spec is in [docs/ASSIGNMENT.md](docs/ASSIGNMENT.md). How Claude Code was used is in [CLAUDE_WORKFLOW.md](CLAUDE_WORKFLOW.md).

**Stack:** Vite + React + React Router DOM (Vercel), Supabase (Postgres, Auth, PostgREST via supabase-js, Edge Functions), Google Books API.

## Run locally

```bash
npm install
cp .env.example .env     # then fill in the two VITE_ values
npm run dev
```

Other scripts: `npm run build`, `npm run lint`, `npm run test:rls`, `npm run test:books`.

The local app talks to the hosted Supabase project, including its deployed `books` Edge Function. You don't need the Google Books key to run the frontend.

## Environment variables

| Variable | Where it lives | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` locally, Vercel env vars | Browser (public) |
| `VITE_SUPABASE_ANON_KEY` | `.env` locally, Vercel env vars | Browser (public, protected by RLS) |
| `GOOGLE_BOOKS_API_KEY` | **Supabase secrets only** | `books` Edge Function |
| `ALLOWED_ORIGINS` (optional) | Supabase secrets | `books` Edge Function CORS allowlist |
| `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` | local `.env` only | `npm run test:rls` |

Set the Google Books key (server-side only):

```bash
supabase secrets set GOOGLE_BOOKS_API_KEY=<your key>
```

`GOOGLE_BOOKS_API_KEY` must **never** be `VITE_`-prefixed, because `VITE_` values are compiled into the browser bundle. The browser never calls Google Books; it calls the `books` Edge Function, which holds the key. Only the two `VITE_SUPABASE_*` values belong in Vercel.

`.env` is gitignored; `.env.example` lists every variable with no values.

## Data model

Schema lives in `supabase/migrations/` (changes only via new migration files). All three tables have RLS enabled.

- **`profiles`**: one row per auth user (created by a trigger on signup), with a `display_name`. Publicly readable; email is never copied here, so logs show display names only.
- **`library_items`**: `(user_id, volume_id, status)` with status one of `want to read`, `reading`, `finished`. Owner-only for select/insert/update/delete; `anon` has no access at all.
- **`logs`**: `body`, optional `rating` (1-5), plus its own `user_id` and `volume_id`. Publicly readable; only the owner can insert, update or delete.

### Privacy design

Libraries are private but logs must be public on a book's page. The solution:

- `logs` stores its **own `volume_id`**. The book page queries only `logs` joined with `profiles`, **never `library_items`**, so it needs no access to anyone's library.
- A **composite foreign key** `logs (user_id, volume_id) -> library_items (user_id, volume_id) on delete cascade` enforces in the database that a log must match a library item owned by the same user. Removing a book from the library deletes its logs.

**Accepted trade-off:** a public log reveals that its author has that book in their library. Nothing else about the library (other books, status) is exposed.

## Security testing

- `npm run test:rls`: RLS isolation test with two real users. **14/14 pass.** Includes a check that users can't change `created_at` on their own log (UPDATE on `logs` is limited to `body` and `rating`).
- `npm run test:books`: Edge Function test (validation, response shape, errors, CORS). **89/89 pass.**
- Secrets audit: **0 matches** for the API key in git history, the production build output, and `prompt-records/`.
- Follow-up hardening idea: `anon` still has Supabase's default table grants on `logs` and `profiles`. RLS blocks its writes and PostgREST can't TRUNCATE, so this is defense in depth; revoking those grants would add a second layer.

## Known issue

Google Books field operators (`intitle:`, `subject:`) returned 0 results during development. The Edge Function therefore sends plain search terms and **filters results by title itself** to keep search title-only. Side effect: a search page can come back with fewer results than the page size, since non-matching titles are dropped.

## Auth notes

Email confirmation is **disabled** so graders can sign up and use every feature instantly.

## Why the Supabase MCP server

The project's `.mcp.json` registers the Supabase MCP server in **read-only** mode, scoped to the `database` and `docs` features. It was chosen because the riskiest parts of this app are the schema and RLS, and it lets Claude Code inspect the live database (tables, RLS flags, applied migrations) to verify what is actually deployed instead of trusting the migration files. Read-only means it cannot change data or schema; migrations go through `supabase db push` run by a person. No token is stored in the config; auth is handled by the MCP OAuth flow.
