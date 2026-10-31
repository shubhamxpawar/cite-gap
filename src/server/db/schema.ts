// Mirrors scripts/migrations/0001_init.sql (docs/04-Backend-Schema.md §2–§6) — do not rename.
import {
  pgEnum, pgSchema, pgTable, uuid, text, timestamp, integer, smallint, boolean, numeric, jsonb, date,
  primaryKey, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const engineId = pgEnum('engine_id', ['chatgpt', 'claude', 'perplexity', 'gemini']);
export const pageType = pgEnum('page_type', ['pricing','docs','comparison','alternatives','blog','changelog','integrations','homepage','other']);
export const domainRole = pgEnum('domain_role', ['own', 'competitor']);
export const ownerClass = pgEnum('owner_class', ['own', 'competitor', 'third_party']);
export const promptIntent = pgEnum('prompt_intent', ['pricing','docs','comparison','alternatives','howto','brand']);
export const runStatus = pgEnum('run_status', ['queued','running','succeeded','partial','failed','canceled']);
export const respStatus = pgEnum('resp_status', ['ok','error','skipped_budget']);
export const citeKind = pgEnum('cite_kind', ['cited', 'retrieved']);
export const planTier = pgEnum('plan_tier', ['free', 'starter', 'growth']);
export const severity = pgEnum('severity', ['critical','high','medium','low']);
export const fixCategory = pgEnum('fix_category', ['content','structure','technical','freshness','coverage']);
export const effort = pgEnum('effort', ['S', 'M', 'L']);
export const reportStatus = pgEnum('report_status', ['pending', 'ready', 'failed']);
export const verifyState = pgEnum('verify_state', ['open','done','verified_win','not_yet']);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Local shim for Supabase's auth.users (docs/decisions.md D4). The table lives in
// the `auth` schema, not `public` — see scripts/migrations/0001_init.sql.
export const authSchema = pgSchema('auth');
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  plan: planTier('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  auditCreditCents: integer('audit_credit_cents').notNull().default(0),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  runCadenceHours: integer('run_cadence_hours').notNull().default(168),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  role: domainRole('role').notNull(),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('domains_workspace_id_hostname_key').on(t.workspaceId, t.hostname),
]);

export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  intent: promptIntent('intent').notNull(),
  source: text('source').notNull().default('manual'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('prompts_workspace_id_active_idx').on(t.workspaceId, t.active)]);

export const checkRuns = pgTable('check_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  trigger: text('trigger').notNull(),
  status: runStatus('status').notNull().default('queued'),
  samplesPerPrompt: smallint('samples_per_prompt').notNull().default(1),
  engines: engineId('engines').array().notNull(),
  systemPrompt: text('system_prompt'),
  plannedCalls: integer('planned_calls').notNull().default(0),
  completedCalls: integer('completed_calls').notNull().default(0),
  failedCalls: integer('failed_calls').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [index('check_runs_workspace_id_created_at_idx').on(t.workspaceId, t.createdAt)]);

export const responses = pgTable('responses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').notNull().references(() => checkRuns.id, { onDelete: 'cascade' }),
  promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  engine: engineId('engine').notNull(),
  model: text('model').notNull(),
  sampleIdx: smallint('sample_idx').notNull().default(0),
  status: respStatus('status').notNull().default('ok'),
  errorCode: text('error_code'),
  answerText: text('answer_text'),
  searchQueries: text('search_queries').array().notNull().default(sql`'{}'`),
  raw: jsonb('raw'),
  latencyMs: integer('latency_ms'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('responses_run_id_prompt_id_engine_sample_idx_key').on(t.runId, t.promptId, t.engine, t.sampleIdx),
  index('responses_workspace_id_prompt_id_engine_created_at_idx').on(t.workspaceId, t.promptId, t.engine, t.createdAt),
]);

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  urlNormalized: text('url_normalized').notNull(),
  hostname: text('hostname').notNull(),
  pageType: pageType('page_type').notNull().default('other'),
  owner: ownerClass('owner').notNull(),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  title: text('title'),
  discoveredVia: text('discovered_via').notNull().default('citation'),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  httpStatus: integer('http_status'),
  contentHash: text('content_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('pages_workspace_id_url_normalized_key').on(t.workspaceId, t.urlNormalized),
  index('pages_workspace_id_owner_page_type_idx').on(t.workspaceId, t.owner, t.pageType),
]);

export const citations = pgTable('citations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  responseId: uuid('response_id').notNull().references(() => responses.id, { onDelete: 'cascade' }),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  urlRaw: text('url_raw').notNull(),
  kind: citeKind('kind').notNull().default('cited'),
  position: smallint('position').notNull(),
  citedText: text('cited_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('citations_workspace_id_page_id_idx').on(t.workspaceId, t.pageId),
  index('citations_response_id_idx').on(t.responseId),
]);

export const pageSnapshots = pgTable('page_snapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  pageId: uuid('page_id').notNull().references(() => pages.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow(),
  finalUrl: text('final_url'),
  httpStatus: integer('http_status'),
  contentHash: text('content_hash'),
  textExcerpt: text('text_excerpt'),
  features: jsonb('features').notNull().default(sql`'{}'`),
}, (t) => [index('page_snapshots_page_id_fetched_at_idx').on(t.pageId, t.fetchedAt)]);

export const fixReports = pgTable('fix_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').notNull().references(() => checkRuns.id, { onDelete: 'cascade' }),
  promptId: uuid('prompt_id').notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  engine: engineId('engine').notNull(),
  winnerPageIds: uuid('winner_page_ids').array().notNull(),
  ownPageId: uuid('own_page_id').references(() => pages.id),
  status: reportStatus('status').notNull().default('pending'),
  summary: text('summary'),
  llmModel: text('llm_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('fix_reports_run_id_prompt_id_engine_key').on(t.runId, t.promptId, t.engine),
]);

export const fixItems = pgTable('fix_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => fixReports.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  category: fixCategory('category').notNull(),
  severity: severity('severity').notNull(),
  effort: effort('effort').notNull(),
  title: text('title').notNull(),
  evidence: text('evidence'),
  recommendation: text('recommendation').notNull(),
  suggestedCopy: text('suggested_copy'),
  source: text('source').notNull().default('llm'),
  state: verifyState('state').notNull().default('open'),
  markedDoneAt: timestamp('marked_done_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [index('fix_items_report_id_sort_order_idx').on(t.reportId, t.sortOrder)]);

export const workspaceBudgets = pgTable('workspace_budgets', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  month: date('month').notNull(),
  capUsd: numeric('cap_usd', { precision: 10, scale: 4 }).notNull(),
  spentUsd: numeric('spent_usd', { precision: 10, scale: 4 }).notNull().default('0'),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.month] })]);

export const auditPurchases = pgTable('audit_purchases', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  stripeSessionId: text('stripe_session_id').unique(),
  amountCents: integer('amount_cents').notNull(),
  creditExpiresAt: timestamp('credit_expires_at', { withTimezone: true }),
  creditApplied: boolean('credit_applied').notNull().default(false),
  runId: uuid('run_id').references(() => checkRuns.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const sampleReports = pgTable('sample_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  hostname: text('hostname').notNull(),
  status: text('status').notNull().default('running'),
  progress: jsonb('progress').notNull().default(sql`'[]'`),
  result: jsonb('result'),
  ipHash: text('ip_hash'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).default(sql`now() + interval '7 days'`),
}, (t) => [index('sample_reports_hostname_created_at_idx').on(t.hostname, t.createdAt)]);

export const emailEvents = pgTable('email_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  providerId: text('provider_id'),
});
