/**
 * Reproduction: prior to the LineBuffer refactor, `runHarnessScript` invoked
 * `opts.onProgress` directly inside the `'data'` and `'close'` handlers
 * without any try/catch. `runHarness` did wrap it — so a throwing progress
 * callback would silently break `runHarnessScript` but be tolerated by
 * `runHarness`. This script demonstrates the asymmetry by exercising the
 * extracted `invokeProgressSafely` helper that both spawn paths now share.
 *
 * Run:
 *   tsx scripts/repro-progress-callback-throws.ts
 *
 * Expected (after fix): a throwing onProgress callback is swallowed by the
 * helper; the surrounding loop keeps making progress and we capture every
 * subsequent line.
 * Observed (before fix): the throw propagates out of the 'data' handler.
 */
import { invokeProgressSafely } from '../src/harness.js';

const lines = [
  'shot 1 of 3',
  'shot 2 of 3',
  'shot 3 of 3',
];

let calls = 0;
let surfaceErrors = 0;

const throwingCallback = (_line: string, _stream: 'stdout' | 'stderr') => {
  calls++;
  throw new Error(`synthetic throw on call ${calls}`);
};

for (const line of lines) {
  try {
    invokeProgressSafely(throwingCallback, line, 'stdout');
  } catch {
    surfaceErrors++;
  }
}

console.log(`callback invoked ${calls} times`);
console.log(`errors that escaped the helper: ${surfaceErrors}`);

if (calls !== lines.length || surfaceErrors !== 0) {
  console.error(
    `FAIL: expected ${lines.length} invocations and 0 leaks; got ${calls} invocations and ${surfaceErrors} leaks`,
  );
  process.exit(1);
}

const undefinedHelperResult = invokeProgressSafely(undefined, 'noop', 'stdout');
console.log(`undefined callback path returns: ${JSON.stringify(undefinedHelperResult)}`);
console.log('all reproduction cases passed');
process.exit(0);
