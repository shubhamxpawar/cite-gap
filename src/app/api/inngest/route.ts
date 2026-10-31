import { serve } from 'inngest/next';
import { inngest } from '@/server/jobs/inngest';
import { sampleReportJob } from '@/server/jobs/sample-report';
import { runCheckJob, runPromptEngineJob } from '@/server/jobs/run-check';
import { buildFixReportJob } from '@/server/jobs/build-fix-report';
import { verifyFixesJob } from '@/server/jobs/verify-fixes';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sampleReportJob, runCheckJob, runPromptEngineJob, buildFixReportJob, verifyFixesJob],
});
