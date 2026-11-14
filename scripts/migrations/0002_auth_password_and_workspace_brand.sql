-- 0002_auth_password_and_workspace_brand.sql
-- Local auth shim: password auth for auth.users (docs/decisions.md D4).
-- Supabase Auth stores password hashes in auth.users; the local shim had none,
-- so sign-in was email-only. Adding the column keeps the local contract identical.
alter table auth.users add column if not exists password_hash text;

-- Workspaces need the brand + category the site actually advertises. Without them
-- onboarding falls back to 'software' and the suggested questions match nothing
-- on the site, so engines never cite the owner's pages.
alter table public.workspaces add column if not exists brand text;
alter table public.workspaces add column if not exists category text;
