import { config } from './config.js';
import { rpc } from './supabase.js';

// Credits every auto task whose waiting period has ended.
// Safe to run alongside pg_cron: the database pays each reward only once.
export function startVerificationJob() {
  const run = async () => {
    try {
      const count = await rpc('api_process_due_verifications');
      if (count > 0) console.log(`[verify] added points for ${count} task(s)`);
    } catch (err) {
      console.error('[verify] job failed:', err?.message ?? err);
    }
  };
  setTimeout(run, 10_000).unref();
  setInterval(run, config.verifyJobMinutes * 60_000).unref();
}
