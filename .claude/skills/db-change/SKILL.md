---
name: db-change
description: Workflow for any database schema change (new table, column, policy, or constraint). Use whenever the schema changes.
---

# db-change

Use whenever the database schema changes: a new table, column, policy or constraint.

## Steps

1. Write a NEW migration file in `supabase/migrations/`. Never edit a migration that's already applied.
2. Review it with the `rls-reviewer` subagent and fix any High or Medium findings.
3. Ask the user to run `supabase db push --linked`, because it requires the database password. Never run it yourself.
4. Verify through the Supabase MCP server that the tables exist, RLS is on, and the migration is applied.
5. Ask the user to run `npm run test:rls`, because it reads `.env`. All checks must pass.
6. Commit.
