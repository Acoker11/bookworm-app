# BookWorm

Netflix-style book browsing app. Spec: docs/ASSIGNMENT.md (source of truth for requirements).
Prompt life cycle: DEFINE > EXPLORE > PLAN > CODE > REVIEW > COMMIT.

## Stack
Vite + React + React Router DOM (Vercel) · Supabase (Postgres, Auth, PostgREST via supabase-js, Edge Functions) · Google Books API.
Out of scope: WebSockets, Realtime, Redis, caching layers.

## Layout
- `src/` frontend · `supabase/migrations/` SQL schema + RLS · `supabase/functions/` Edge Functions
- `CLAUDE_WORKFLOW.md` documents how Claude Code was used (required by rubric)
- `.claude/agents`, `.claude/skills`, `.mcp.json` project Claude config

## Hard rules (automatic-fail if broken)
- NEVER touch `.claude/hooks/`, `.claude/settings.json`, `.claude/state/`, or `prompt-records/`. No edit, delete, rewrite, or disable.
- Google Books API key lives ONLY as a Supabase secret (`supabase secrets set`). Never in client code, any `VITE_` var, repo, git history, prompts, or MCP config.
- Browser never calls Google Books. All calls go through an Edge Function.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may be `VITE_`-prefixed. Never use the service-role key in the frontend.
- Never commit `.env*` (except `.env.example`, no real values) or MCP tokens.
- Every table has RLS enabled; authorization is enforced in the DB, not by hiding UI.
- Nothing in `prompt-records/` may ever be gitignored; it must always be tracked and committed.

## Conventions
- Edge Functions: anonymous-callable; validate input (query required, max length, page range); return only fields the UI needs (https covers, handle missing cover/description); handle upstream errors, 429, timeouts with meaningful status; correct CORS.
- Search is title-only (`intitle:`). Genres: Adventure, Technology, Horror, Sci-Fi, Fiction, Non-Fiction. Home = "technology". Every book list has Load More.
- Schema: `profiles`, `library_items`, `logs`. Logs need a matching library item (DB constraint) with ON DELETE CASCADE. Library is private; logs are publicly readable without exposing any library. The exact design is decided in the schema step.
- Logs show display name, never email. Rating optional 1-5. Status: want to read | reading | finished.
- Schema changes only via new files in `supabase/migrations/`.
- Frontend: every route works on direct load/refresh (`vercel.json` rewrites); show loading and friendly error states.
- Match existing code style; keep changes small and focused.

## Workflow
- Plan before coding on anything non-trivial. Commit in small, reviewed steps.
- Delegate noisy work (RLS review, secrets audit, codebase exploration) to subagents.
- `/clear` between unrelated tasks; `/compact` at natural breakpoints. Give Claude only the files and errors a task needs.
- Before committing: grep for secrets, check `git status` for stray `.env`.

## Commands
- `npm run dev` · `npm run build` · `npm run lint`
- `npm run test:rls` (user runs; reads `.env`) · `npm run test:books`
- `supabase db push --linked` (user runs; needs DB password)
- `supabase functions deploy books --use-api`
