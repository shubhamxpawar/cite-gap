import Link from 'next/link';
import { signInAction } from '@/app/actions';
import { SiteFooter, SiteHeader } from '@/components/site-header';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; sampleId?: string }> }) {
  const { error, sampleId } = await searchParams;
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 py-12">
        <div className="brutal p-6">
          <p className="font-mono text-xs text-muted">FREE WORKSPACE</p>
          <h1 className="font-display text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            8 prompts · 2 engines · weekly checks · teaser fix only. No card.
            {sampleId && ' Your sample report is carried over so onboarding is prefilled.'}
          </p>
          {error && <p role="alert" className="mt-3 border-2 border-critical px-2 py-1 text-sm text-critical">{error}</p>}
          <form action={signInAction} className="mt-4 space-y-3">
            {sampleId && <input type="hidden" name="sampleId" value={sampleId} />}
            <label className="block text-sm font-medium" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com"
              className="brutal-flat min-h-11 w-full bg-surface px-3 py-2" />
            <button type="submit" className="brutal brutal-hover min-h-11 w-full bg-accent px-4 py-2 font-display font-bold">
              Create workspace ▸
            </button>
          </form>
          <p className="mt-4 text-sm text-muted">Already have an account? <Link href={`/login${sampleId ? `?sampleId=${sampleId}` : ''}`} className="font-medium underline">Log in</Link></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
