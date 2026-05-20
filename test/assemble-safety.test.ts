import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAssemble } from '../src/tools/assemble.js';
import type { AssembleInputT } from '../src/schemas.js';

test('assemble: rejects dialogueReplace=true + nativeVolume=1.0 (double-narration combo) before spawning', async () => {
  const input: AssembleInputT = {
    action: 'assemble',
    project: 'whatever',
    episode: 1,
    subtitles: true,
    music: true,
    ambient: true,
    ambientVolume: 0.3,
    dialogueReplace: true,
    nativeVolume: 1.0,
  };
  const result = await handleAssemble(input);
  const body = (result as { structuredContent?: { ok?: boolean; message?: string } }).structuredContent;
  assert.equal(body?.ok, false, 'safety check must short-circuit before spawn');
  assert.match(body?.message ?? '', /double narration/i, 'error message names the actual bug');
  assert.match(body?.message ?? '', /nativeVolume: 0/i, 'error mentions the safe default');
});

test('assemble: accepts dialogueReplace=true + nativeVolume=0.2 (ambient-bed pattern)', async () => {
  // We can't actually run assemble without a harness binary, so we just
  // verify the safety check doesn't reject. The downstream error will be
  // about the missing harness, NOT about double narration.
  const input: AssembleInputT = {
    action: 'assemble',
    project: 'whatever',
    episode: 1,
    subtitles: true,
    music: true,
    ambient: true,
    ambientVolume: 0.3,
    dialogueReplace: true,
    nativeVolume: 0.2,
  };
  const result = await handleAssemble(input);
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /double narration/i, '0.2 is the canonical ambient-bed value; should pass the safety check');
});

test('assemble: dialogueReplace=true with nativeVolume omitted lets the harness default to 0', async () => {
  const input: AssembleInputT = {
    action: 'assemble',
    project: 'whatever',
    episode: 1,
    subtitles: true,
    music: true,
    ambient: true,
    ambientVolume: 0.3,
    dialogueReplace: true,
    // nativeVolume intentionally undefined
  };
  const result = await handleAssemble(input);
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /double narration/i, 'omitted nativeVolume must not trip the safety check');
});
