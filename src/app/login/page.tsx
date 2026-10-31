import Link from 'next/link';
import { demoSignInAction, signInAction } from '@/app/actions';
import { SiteFooter, SiteHeader } from '@/components/site-header';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sampleId?: string }> }) {
  const { error, sampleId } = await searchParams;
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-12">
        <div className="brutal p-6">
          <h1 className="font-display text-2xl font-bold">Log in</h1>
          <p className="mt-1 text-sm text-muted">Magic-link style sign-in. Locally, the email identifies your workspace.</p>
          {error && <p role="alert" className="mt-3 border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}
          <form action={signInAction} className="mt-4 space-y-3">
            {sampleId && <input type="hidden" name="sampleId" value={sampleId} />}
            <label className="block text-sm font-medium" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com"
              className="brutal-flat min-h-11 w-full bg-surface px-3 py-2" />
            <button type="submit" className="brutal brutal-hover min-h-11 w-full bg-accent px-4 py-2 font-display font-bold">
              Continue with email ▸
            </button>
          </form>
          <div className="mt-4 border-t border-ink/20 pt-4">
            <form action={demoSignInAction}>
              <button type="submit" className="brutal-flat min-h-11 w-full bg-surface px-4 py-2 text-sm font-bold hover:bg-third-tint">
                Open the seeded demo workspace
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">Demo data is synthetic and labelled as such. Run <code className="font-mono">npm run db:seed</code> first.</p>
          </div>
          <p className="mt-4 text-sm text-muted">No account? <Link href={`/signup${sampleId ? `?sampleId=${sampleId}` : ''}`} className="font-medium underline">Create a free workspace</Link></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
