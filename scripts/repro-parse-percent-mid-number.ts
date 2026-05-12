/**
 * Reproduction: `parsePercent` in `src/progress.ts` uses `/(\d{1,3}(?:\.\d+)?)\s*%/`,
 * which matches anywhere in the line. For "saved 1000% disk space" the engine
 * finds the substring "000%" (positions 7..10) — interpreted as 0%, which is
 * within the valid 0..100 range, so a spurious `progress: 0` notification is
 * emitted. Same problem for any line containing `\d{4,}%`.
 *
 * Run:
 *   tsx scripts/repro-parse-percent-mid-number.ts
 *
 * Expected (after fix): no progress notification fired for such lines.
 * Observed (before fix): `progress: 0` is emitted for "1000% off".
 */
import { makeProgressEmitter } from '../src/progress.js';

function captureEmits(line: string): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  const emitter = makeProgressEmitter({
    progressToken: 'tok',
    send: async (notification) => {
      const params = (notification as { params?: Record<string, unknown> }).params;
      if (params) seen.push(params);
    },
  });
  emitter.onLine(line, 'stdout');
  return seen;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

const cases: Array<{ label: string; line: string; expectEmpty: boolean }> = [
  { label: 'normal 45%', line: 'render step 45% complete', expectEmpty: false },
  { label: 'normal 100%', line: 'done 100%', expectEmpty: false },
  { label: 'fractional 12.5%', line: 'progress 12.5% so far', expectEmpty: false },
  { label: 'four-digit 1000% (bug case)', line: 'saved 1000% disk space', expectEmpty: true },
  { label: 'five-digit 12345%', line: 'unexpected 12345% growth', expectEmpty: true },
  { label: 'over-100 200%', line: 'cpu spike 200% momentary', expectEmpty: true },
];

let failed = 0;
for (const c of cases) {
  const emits = captureEmits(c.line);
  await flush();
  const empty = emits.length === 0;
  const ok = c.expectEmpty ? empty : !empty;
  const tag = ok ? 'PASS' : 'FAIL';
  const detail = emits.length === 0
    ? '(no emit)'
    : `progress=${emits[0].progress}, total=${emits[0].total}`;
  console.log(`[${tag}] ${c.label}: ${detail}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} cases failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length} percent-parse cases behave correctly`);
process.exit(0);
