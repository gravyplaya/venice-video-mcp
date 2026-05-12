/**
 * Reproduction: harness stdout/stderr buffering only splits on '\n'.
 *
 * When a child process emits classic ffmpeg-style progress (each stat update
 * terminated by '\r' so it overwrites the previous one on a TTY), no '\n'
 * arrives until the encode finishes. The harness wrapper then keeps appending
 * to its `stdoutBuf` and never calls `onLine`, so `makeProgressEmitter` never
 * sees a progress line and the MCP client receives zero progress notifications
 * for the duration of the encode.
 *
 * This script feeds a sequence of '\r'-separated chunks into the same line
 * buffer the harness uses and reports whether they're surfaced.
 *
 * Run:
 *   tsx scripts/repro-harness-line-buffer-cr.ts
 *
 * Expected (after fix): every ffmpeg stat line is emitted as a separate line.
 * Observed (before fix): nothing is emitted until a trailing '\n' arrives.
 */
import { LineBuffer } from '../src/line-buffer.js';

const buf = new LineBuffer();
const emitted: string[] = [];

const ffmpegChunks = [
  'frame=   1 fps=0.0 q=24.0 size=     0kB time=00:00:00.04 bitrate=...\r',
  'frame=  60 fps=60. q=24.0 size=    32kB time=00:00:02.50 bitrate=...\r',
  'frame= 120 fps=40. q=24.0 size=    96kB time=00:00:05.00 bitrate=...\r',
  'frame= 240 fps=30. q=24.0 size=   192kB time=00:00:10.00 bitrate=...\r',
];

for (const chunk of ffmpegChunks) {
  for (const line of buf.push(chunk)) emitted.push(line);
}
const trailing = buf.flush();
if (trailing) emitted.push(trailing);

console.log(`emitted ${emitted.length} lines for ${ffmpegChunks.length} chunks`);
for (const line of emitted) console.log(`  -> ${line.slice(0, 70)}`);

const ok = emitted.length === ffmpegChunks.length && emitted.every((l) => l.includes('frame='));
if (!ok) {
  console.error(
    `\nFAIL: expected ${ffmpegChunks.length} ffmpeg lines, got ${emitted.length}. ` +
      `Progress notifications would be silently dropped during an encode.`,
  );
  process.exit(1);
}

const crlfBuf = new LineBuffer();
const crlfChunks = ['a\r', '\nb\r\n', 'c\n', 'd'];
const crlfEmitted: string[] = [];
for (const chunk of crlfChunks) {
  for (const line of crlfBuf.push(chunk)) crlfEmitted.push(line);
}
const crlfTrailing = crlfBuf.flush();
if (crlfTrailing) crlfEmitted.push(crlfTrailing);
console.log(`\ncrlf split across chunks: ${JSON.stringify(crlfEmitted)}`);

if (crlfEmitted.join('|') !== 'a|b|c|d') {
  console.error(`FAIL: expected ["a","b","c","d"], got ${JSON.stringify(crlfEmitted)}`);
  process.exit(1);
}

console.log('\nall reproduction cases passed');
