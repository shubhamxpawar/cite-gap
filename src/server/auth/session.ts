// Cookie-session auth stub (docs/decisions.md D4).
// Implements the same contract Supabase Auth provides (a stable user id) so the
// RLS policies and queries don't change when we swap to Supabase Auth.
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/server/db/client';
import { authUsers, profiles, workspaces, workspaceMembers } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

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

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return token ? verify(token) : null;
}

// Returns {userId, workspaceId}; null when signed out.
export async function getCurrentUser() {
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
}

// Dev sign-in: email-only (magic-link-less local stub). Creates user, profile,
// workspace (plan free) + owner membership. Supabase Auth replaces the identity
// part later; workspace creation moves into its own onboarding action then.
export async function signInOrCreate(email: string): Promise<{ userId: string; workspaceId: string }> {
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
