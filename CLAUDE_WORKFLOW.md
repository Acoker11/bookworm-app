# Claude Code Workflow

How BookWorm was built with Claude Code. Each phase followed DEFINE > EXPLORE > PLAN > CODE > REVIEW > COMMIT, with small reviewed commits. Project config lives in `CLAUDE.md`, `.claude/agents/`, `.claude/skills/` and `.mcp.json`.

## CLAUDE.md

`CLAUDE.md` holds the stack, hard rules (secret placement, RLS everywhere, no browser calls to Google Books), and conventions. It is short on purpose: rules Claude must always follow, not a dump of everything.

## Subagent: `rls-reviewer`

Defined in `.claude/agents/rls-reviewer.md`. It is read-only (`tools: Read, Grep, Glob`) and reviews `supabase/migrations/` against the CLAUDE.md rules: RLS on every table, private library, public logs that don't leak libraries, no email exposure, composite FK with cascade, `WITH CHECK` on writes.

Delegating this keeps long SQL reading out of the main context.

Concrete result on `20261025120000_init_schema.sql`:

- The review found a **Medium** bug: long display names made signup fail, because the signup trigger inserted a name that violated the `profiles.display_name` length check (1-50 characters). The fix truncates to 50 characters with `left(btrim(...), 50)` and falls back to `'Reader'` when empty.
- A **re-review found no High issues.**
- The review also raised a Medium about public logs revealing part of a user's library. That is the accepted trade-off documented in the README (a public log reveals its author has that book), and the design keeps the book page off `library_items`.

## Skill: `db-change`

Defined in `.claude/skills/db-change/SKILL.md`. It encodes the procedure for **any** schema change (new table, column, policy or constraint):

1. Write a NEW migration file in `supabase/migrations/`; never edit one already applied.
2. Review it with the `rls-reviewer` subagent and fix High and Medium findings.
3. Ask the user to run `supabase db push --linked` (needs the DB password, so Claude never runs it).
4. Verify through the Supabase MCP server that tables exist, RLS is on, and the migration is applied.
5. Ask the user to run `npm run test:rls` (reads `.env`); all checks must pass.
6. Commit.

Because it is a skill, the procedure is invoked when relevant instead of being pasted into prompts.

## MCP server: Supabase (read-only)

Configured in `.mcp.json` with `read_only=true` and features limited to `database,docs`; no token is committed.

Concrete use: after writing the init migration, Claude used it to list tables and check RLS flags. That check **caught that the migration had not been pushed yet**: the remote database didn't have the tables. The user then ran `supabase db push --linked`, and a second check confirmed the tables, RLS, and the applied migration. Without it, "the migration file looks right" could have been mistaken for "the database is right".

## Context management

- **`/clear` between phases** (schema, Edge Function, public pages, auth/library/logs, docs) so each task started with only the files and errors it needed.
- **Plan mode before risky steps**, such as the schema and RLS design and the privacy design for logs, so the approach was agreed before any SQL was written. Twice Claude tried to write files while still in plan mode; I declined both times and told it to show the plan first.
- **Only the files a task needs:** I closed the `.env` tab in VS Code before prompting, because the IDE attaches the open file to the prompt and that would have put real values in context and in `prompt-records/`.
- **Lightweight tooling:** I used Deno instead of Docker to test the Edge Function locally, because of Docker's size.
- **Layer-by-layer debugging:** when search returned nothing, I isolated it in order: the function, then Google with the key, then plain vs operator queries. That showed `intitle:`/`subject:` return 0 results, which is the known issue in the README.
- **Manual approvals** for anything with side effects. Claude never runs `supabase db push` or tests that read `.env`; the user runs them. Hooks, `.claude/settings.json` and `prompt-records/` were never modified.
- **Noisy work delegated to subagents** (RLS review) rather than read in the main session.
- **Secrets discipline:** the Google Books key was only ever set via `supabase secrets set`; never pasted in a prompt. Before commits: grep for secrets and check `git status` for stray `.env` files.

## Debugging notes: Google Books key setup

The key was never typed into a prompt, written to a file, or shown on screen. The key itself is not recorded anywhere in this repo.

- **Setting it:** I ran `read -s GKEY`, then `supabase secrets set` using `$GKEY`, so the key stayed out of terminal output and shell history. Then I ran `unset GKEY`.
- **Symptom:** the deployed function first returned `upstream_error`.
- **Cause:** I had pasted several lines at once, and `read -s` swallowed the next command as its input. `$GKEY` was empty, so Google answered "API key not valid" or the shared-quota 429.
- **Fix:** I re-saved the secret in the Supabase dashboard (Edge Functions > Secrets), confirmed the value started with `AIza`, and tested through the deployed function rather than handling the key in the terminal.
- **Lessons:** run `read -s` on its own line, always `unset` afterwards, and test through the function.
