// Analytics shim — docs/02-App-Flow.md §13. Swap for PostHog/Segment later;
// locally every event goes to the server console so the funnel is inspectable.
export type AnalyticsEvent =
  | 'sample_started'
  | 'sample_completed'
  | 'sample_to_signup'
  | 'onboarding_completed'
  | 'run_started'
  | 'run_completed'
  | 'fix_opened'
  | 'fix_item_done'
  | 'fix_verified_win'
  | 'upgrade_clicked';

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  console.info(`[analytics] ${event}`, JSON.stringify(props));
}
