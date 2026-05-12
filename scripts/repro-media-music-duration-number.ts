/**
 * Reproduction: MediaShape advertises that `duration` accepts string OR number,
 * but MediaGenerateMusic.duration is `z.string().default('60')` — pure string
 * with no coercion.
 *
 * An agent following the public JSON Schema (MediaShape) is free to pass a
 * number for duration. The discriminated-union parser then rejects it with a
 * misleading `Expected string, received number` error.
 *
 * Run:
 *   tsx scripts/repro-media-music-duration-number.ts
 *
 * Expected (after fix):
 *   exit 0; both string "60" and number 90 are accepted; both end up as
 *   string CLI args for the harness.
 *
 * Observed (before fix):
 *   exit 1; numeric duration is rejected.
 */
import { MediaInput, MediaShape } from '../src/schemas.js';
import { z } from 'zod';

const SHAPE_PARSER = z.object(MediaShape);

function attempt(label: string, payload: unknown): { ok: boolean; detail: string } {
  const shape = SHAPE_PARSER.safeParse(payload);
  if (!shape.success) {
    return { ok: false, detail: `MediaShape rejected ${label}: ${shape.error.issues.map((i) => i.message).join('; ')}` };
  }
  const parsed = MediaInput.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, detail: `MediaInput rejected ${label}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  if (parsed.data.action !== 'generate_music') {
    return { ok: false, detail: `unexpected action ${parsed.data.action}` };
  }
  return { ok: true, detail: `${label} -> duration=${JSON.stringify(parsed.data.duration)} (type ${typeof parsed.data.duration})` };
}

const cases: Array<{ label: string; payload: unknown }> = [
  {
    label: 'string "60"',
    payload: {
      action: 'generate_music',
      project: 'the-audacity',
      episode: 1,
      prompt: 'late-night talk-show theme',
      duration: '60',
    },
  },
  {
    label: 'number 90',
    payload: {
      action: 'generate_music',
      project: 'the-audacity',
      episode: 1,
      prompt: 'late-night talk-show theme',
      duration: 90,
    },
  },
  {
    label: 'omitted (default 60)',
    payload: {
      action: 'generate_music',
      project: 'the-audacity',
      episode: 1,
      prompt: 'late-night talk-show theme',
    },
  },
];

let failed = 0;
for (const c of cases) {
  const result = attempt(c.label, c.payload);
  const tag = result.ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${result.detail}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed}/${cases.length} cases failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length} cases accepted`);
process.exit(0);
