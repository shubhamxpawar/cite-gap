// Cookie-session auth stub (docs/decisions.md D4).
// Implements the same contract Supabase Auth provides (a stable user id) so the
// RLS policies and queries don't change when we swap to Supabase Auth.
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { authUsers, profiles, workspaces, workspaceMembers } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, passwordPolicyError, verifyPassword } from './password';

const COOKIE = 'citegap_session';
const SECRET = process.env.SESSION_SECRET ?? 'dev-only-secret-rotate-me';

function sign(userId: string) {
  const mac = crypto.createHmac('sha256', SECRET).update(userId).digest('base64url');
  return `${userId}.${mac}`;
}

function verify(token: string): string | null {
  const [userId, mac] = token.split('.');
  if (!userId || !mac) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(userId).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect)) ? userId : null;
}

export async function createSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, sign(userId), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// `cache()` dedupes these per request: the layout and the page both call
// getCurrentUser(), which would otherwise repeat the same queries.
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return token ? verify(token) : null;
});

// Returns {userId, workspaceId}; null when signed out.
export const getCurrentUser = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  const profile = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!memberships.length) return { userId, email: profile[0]?.email ?? '', workspaceId: null as string | null };
  return { userId, email: profile[0]?.email ?? '', workspaceId: memberships[0].workspaceId };
});

// Creates/looks up user, profile, workspace + owner membership, and opens a session.
async function createAccountSession(email: string): Promise<{ userId: string; workspaceId: string }> {
  const normalized = email.trim().toLowerCase();
  let [user] = await db.select().from(authUsers).where(eq(authUsers.email, normalized)).limit(1);
  if (!user) {
    [user] = await db.insert(authUsers).values({ email: normalized }).returning();
    await db.insert(profiles).values({ userId: user.id, email: normalized });
  }
  const existing = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).limit(1);
  let workspaceId = existing[0]?.workspaceId;
  if (!workspaceId) {
    const [ws] = await db.insert(workspaces).values({ name: normalized.split('@')[0] + "'s workspace" }).returning();
    workspaceId = ws.id;
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.id, role: 'owner' });
  }
  await createSession(user.id);
  return { userId: user.id, workspaceId };
}

// Passwordless sign-in — used only by the demo button. Real sign-in requires a password.
export async function signInOrCreate(email: string): Promise<{ userId: string; workspaceId: string }> {
  return createAccountSession(email);
}

export type AuthResult = { userId: string; workspaceId: string } | { error: string };

async function ensureProfileAndWorkspace(userId: string, email: string): Promise<string> {
  const existing = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1);
  if (existing[0]?.workspaceId) return existing[0].workspaceId;
  const [ws] = await db.insert(workspaces).values({ name: email.split('@')[0] + "'s workspace" }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId, role: 'owner' });
  return ws.id;
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const policyError = passwordPolicyError(password);
  if (policyError) return { error: policyError };
  const [existing] = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, normalized)).limit(1);
  if (existing) return { error: 'An account with that email already exists — log in instead.' };
  const [user] = await db.insert(authUsers).values({ email: normalized, passwordHash: await hashPassword(password) }).returning();
  await db.insert(profiles).values({ userId: user.id, email: normalized });
  const workspaceId = await ensureProfileAndWorkspace(user.id, normalized);
  await createSession(user.id);
  return { userId: user.id, workspaceId };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(authUsers).where(eq(authUsers.email, normalized)).limit(1);
  if (!user) return { error: 'No account with that email — create a free workspace first.' };
  if (!user.passwordHash) {
    // This account predates password auth: set its password now (local, user's data).
    await db.update(authUsers).set({ passwordHash: await hashPassword(password) }).where(eq(authUsers.id, user.id));
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Incorrect password.' };
  }
  const workspaceId = await ensureProfileAndWorkspace(user.id, normalized);
  await createSession(user.id);
  return { userId: user.id, workspaceId };
}
