-- 0001_init.sql — schema from docs/04-Backend-Schema.md §2–§6, verbatim.
-- Local-only addition: `auth.uid()` shim (Supabase compatibility, see docs/decisions.md D4).

-- ============ local auth shim (not in spec; required without Supabase) ============
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

-- (Supabase provides auth.users in cloud; local shim so FKs in §3 resolve)
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);

-- ============ §2 enums & helper ============
create extension if not exists pgcrypto;

create type engine_id    as enum ('chatgpt','claude','perplexity','gemini');
create type page_type    as enum ('pricing','docs','comparison','alternatives','blog','changelog','integrations','homepage','other');
create type domain_role  as enum ('own','competitor');
create type owner_class  as enum ('own','competitor','third_party');
create type prompt_intent as enum ('pricing','docs','comparison','alternatives','howto','brand');
create type run_status   as enum ('queued','running','succeeded','partial','failed','canceled');
create type resp_status  as enum ('ok','error','skipped_budget');
create type cite_kind    as enum ('cited','retrieved');
create type plan_tier    as enum ('free','starter','growth');
create type severity     as enum ('critical','high','medium','low');
create type fix_category as enum ('content','structure','technical','freshness','coverage');
create type effort       as enum ('S','M','L');
create type report_status as enum ('pending','ready','failed');
create type verify_state as enum ('open','done','verified_win','not_yet');

-- (is_member defined in §2 of the spec is created after §3 tables — PG validates
--  SQL function bodies at creation and workspace_members doesn't exist yet)

-- ============ §3 core tables ============
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null, display_name text, created_at timestamptz default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan plan_tier not null default 'free',
  stripe_customer_id text unique, stripe_subscription_id text unique,
  audit_credit_cents int not null default 0,
  next_run_at timestamptz, run_cadence_hours int not null default 168,
  created_at timestamptz default now()
);

create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','member')),
  primary key (workspace_id, user_id)
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  hostname text not null,                 -- normalized, no www
  role domain_role not null,
  label text,                             -- display name
  created_at timestamptz default now(),
  unique (workspace_id, hostname)
);
create unique index one_own_domain_per_ws on domains(workspace_id) where role = 'own';

create table prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  text text not null check (char_length(text) between 8 and 400),
  intent prompt_intent not null,
  source text not null default 'manual' check (source in ('manual','generated','sample')),
  active boolean not null default true,
  created_at timestamptz default now()
);
create index on prompts(workspace_id, active);

create table check_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trigger text not null check (trigger in ('manual','schedule','audit','onboarding')),
  status run_status not null default 'queued',
  samples_per_prompt smallint not null default 1,
  engines engine_id[] not null,
  system_prompt text,
  planned_calls int not null default 0, completed_calls int not null default 0, failed_calls int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  started_at timestamptz, finished_at timestamptz, created_at timestamptz default now()
);
create index on check_runs(workspace_id, created_at desc);

create table responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid not null references check_runs(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine engine_id not null, model text not null,
  sample_idx smallint not null default 0,
  status resp_status not null default 'ok', error_code text,
  answer_text text, search_queries text[] not null default '{}',
  raw jsonb, latency_ms int, cost_usd numeric(10,4) not null default 0,
  created_at timestamptz default now(),
  unique (run_id, prompt_id, engine, sample_idx)
);
create index on responses(workspace_id, prompt_id, engine, created_at desc);

create table pages (                      -- every URL ever seen (cited or discovered)
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  url_normalized text not null,
  hostname text not null,
  page_type page_type not null default 'other',
  owner owner_class not null,
  domain_id uuid references domains(id) on delete set null,
  title text,
  discovered_via text not null default 'citation' check (discovered_via in ('citation','sitemap','nav','manual')),
  last_fetched_at timestamptz, http_status int, content_hash text,
  created_at timestamptz default now(),
  unique (workspace_id, url_normalized)
);
create index on pages(workspace_id, owner, page_type);

create table citations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  page_id uuid not null references pages(id) on delete cascade,
  url_raw text not null,
  kind cite_kind not null default 'cited',
  position smallint not null,
  cited_text text,
  created_at timestamptz default now()
);
create index on citations(workspace_id, page_id);
create index on citations(response_id);

create table page_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  fetched_at timestamptz default now(),
  final_url text, http_status int, content_hash text,
  text_excerpt text,                      -- readable text, capped ~60k chars
  features jsonb not null default '{}'    -- see §7
);
create index on page_snapshots(page_id, fetched_at desc);

create table fix_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid not null references check_runs(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine engine_id not null,
  winner_page_ids uuid[] not null,
  own_page_id uuid references pages(id),  -- null => MISSING_PAGE
  status report_status not null default 'pending',
  summary text, llm_model text, created_at timestamptz default now(),
  unique (run_id, prompt_id, engine)
);

create table fix_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references fix_reports(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  category fix_category not null, severity severity not null, effort effort not null,
  title text not null, evidence text, recommendation text not null, suggested_copy text,
  source text not null default 'llm' check (source in ('deterministic','llm')),
  state verify_state not null default 'open',
  marked_done_at timestamptz, verified_at timestamptz,
  sort_order int not null default 0
);
create index on fix_items(report_id, sort_order);

-- ============ §2 helper (moved after tables; see comment above) ============
create or replace function is_member(ws uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

-- ============ §4 billing, budgets, public sample reports ============
create table workspace_budgets (
  workspace_id uuid references workspaces(id) on delete cascade,
  month date not null,                     -- first day of month
  cap_usd numeric(10,4) not null, spent_usd numeric(10,4) not null default 0,
  primary key (workspace_id, month)
);

create table audit_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  stripe_session_id text unique, amount_cents int not null,
  credit_expires_at timestamptz, credit_applied boolean not null default false,
  run_id uuid references check_runs(id), created_at timestamptz default now()
);

create table sample_reports (            -- PUBLIC, not workspace-scoped
  id uuid primary key default gen_random_uuid(),
  hostname text not null,
  status text not null default 'running' check (status in ('running','ready','partial','failed')),
  progress jsonb not null default '[]',   -- ordered step log for SSE
  result jsonb,                           -- see §7
  ip_hash text, cost_usd numeric(10,4) default 0,
  created_at timestamptz default now(), expires_at timestamptz default now() + interval '7 days'
);
create index on sample_reports(hostname, created_at desc);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null, sent_at timestamptz default now(), provider_id text
);

-- ============ §5 row-level security ============
-- Local note: workspaces with no auth.users FK shim — auth.users table exists below (local shim section).

alter table workspaces enable row level security;
create policy ws_read on workspaces for select using (is_member(id));
create policy ws_update on workspaces for update using (is_member(id));

do $$ declare t text; begin
  foreach t in array array['domains','prompts','check_runs','responses','pages','citations',
    'page_snapshots','fix_reports','fix_items','workspace_budgets','audit_purchases','email_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_member(workspace_id))', t||'_sel', t);
  end loop; end $$;

-- writes from the browser allowed only for user-managed tables
create policy domains_w on domains for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy prompts_w on prompts for all using (is_member(workspace_id)) with check (is_member(workspace_id));
create policy fix_items_state on fix_items for update using (is_member(workspace_id)) with check (is_member(workspace_id));

-- workspace_members & profiles: self-only
alter table workspace_members enable row level security;
create policy wm_self on workspace_members for select using (user_id = auth.uid());
alter table profiles enable row level security;
create policy pr_self on profiles for all using (user_id = auth.uid());

-- sample_reports: no direct client access; read/write via server only (service role)
alter table sample_reports enable row level security;

-- ============ §6 required views ============
create or replace view v_citation_matrix as
select r.workspace_id, r.engine, p.page_type, p.owner,
       date_trunc('week', r.created_at) as week,
       count(distinct r.id)             as responses_with_cite,
       count(*)                         as citation_rows
from citations c
join responses r on r.id = c.response_id
join pages p     on p.id = c.page_id
where c.kind = 'cited' and r.status = 'ok'
group by 1,2,3,4,5;

create or replace view v_lost_prompts as
with latest as (
  select distinct on (prompt_id, engine) id, workspace_id, prompt_id, engine, created_at
  from responses where status='ok' order by prompt_id, engine, created_at desc
), agg as (
  select l.*,
    bool_or(p.owner='own')        filter (where c.kind='cited') as own_cited,
    bool_or(p.owner<>'own')       filter (where c.kind='cited') as other_cited
  from latest l left join citations c on c.response_id=l.id left join pages p on p.id=c.page_id
  group by l.id, l.workspace_id, l.prompt_id, l.engine, l.created_at
)
select * from agg where coalesce(own_cited,false)=false and coalesce(other_cited,false)=true;

