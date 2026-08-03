<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase & migrations

- **This environment cannot resolve `*.supabase.co`.** Do NOT attempt to
  connect, link, or `db push` to the remote database — DNS for the project host
  does not resolve here (general internet does). Workflow: the assistant writes
  SQL migration files; the maintainer applies them via the Supabase dashboard
  SQL editor and reports results back.
- `supabase/migrations/20260731120000_pregnancy_mode_foundation.sql` is
  **APPLIED TO PRODUCTION. Never edit it.** The same rule holds for any
  already-applied migration — all future schema changes go in new migration
  files.
