/**
 * Repro: stderr lines that mention clock-like `time=HH:MM:SS` but are not
 * ffmpeg stats (no `frame=`) must not emit MCP progress.
 */
import assert from 'node:assert/strict';
import { makeProgressEmitter } from '../src/progress.js';

const seen: unknown[] = [];
const emitter = makeProgressEmitter({
  progressToken: 'tok',
  send: async (n) => {
    seen.push(n);
  },
});

emitter.onLine('Tool log: estimated time=01:05:07 remaining', 'stderr');
await new Promise<void>((resolve) => setImmediate(resolve));

assert.equal(
  seen.length,
  0,
  'bug: time= without frame= must not be parsed as ffmpeg progress',
);
console.log('repro OK: no spurious progress for non-ffmpeg time= lines');
