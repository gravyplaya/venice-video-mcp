import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { AssembleInput, EpisodeInput, MediaInput, MediaShape, SeriesInput } from '../src/schemas.js';

test('SeriesInput applies defaults for new action', () => {
  const parsed = SeriesInput.parse({
    action: 'new',
    name: 'The Audacity',
    concept: 'A sarcastic late-night show host.',
  });

  assert.equal(parsed.action, 'new');
  assert.equal(parsed.genre, 'drama');
  assert.equal(parsed.setting, '');
});

test('EpisodeInput coerces number-like fields for storyboard', () => {
  const parsed = EpisodeInput.parse({
    action: 'storyboard',
    project: 'the-audacity',
    episode: '2',
    cfgScale: '7.5',
  });

  assert.equal(parsed.action, 'storyboard');
  assert.equal(parsed.episode, 2);
  assert.equal(parsed.cfgScale, 7.5);
  assert.equal(parsed.refine, true);
});

test('SeriesInput rejects explore_aesthetic count out of range', () => {
  const result = SeriesInput.safeParse({
    action: 'explore_aesthetic',
    project: 'the-audacity',
    count: 9,
  });

  assert.equal(result.success, false);
});

test('MediaInput.generate_ambient applies default duration and enforces layer enum', () => {
  const parsed = MediaInput.parse({
    action: 'generate_ambient',
    project: 'the-audacity',
    episode: 1,
    layer: 'rain-heavy',
    prompt: 'Steady gentle rain on a city street at night, no thunder, continuous loop.',
  });
  if (parsed.action !== 'generate_ambient') throw new Error('expected generate_ambient');
  assert.equal(parsed.layer, 'rain-heavy');
  assert.equal(parsed.duration, 22);

  const bad = MediaInput.safeParse({
    action: 'generate_ambient',
    project: 'the-audacity',
    episode: 1,
    layer: 'thunderstorm',
    prompt: 'storm sounds',
  });
  assert.equal(bad.success, false);
});

test('MediaInput.generate_music accepts both string and numeric duration (matches MediaShape)', () => {
  const stringDuration = MediaInput.safeParse({
    action: 'generate_music',
    project: 'the-audacity',
    episode: 1,
    prompt: 'late-night talk-show theme',
    duration: '60',
  });
  assert.equal(stringDuration.success, true, 'string duration should parse');

  const numericDuration = MediaInput.safeParse({
    action: 'generate_music',
    project: 'the-audacity',
    episode: 1,
    prompt: 'late-night talk-show theme',
    duration: 90,
  });
  assert.equal(
    numericDuration.success,
    true,
    `numeric duration should be accepted because MediaShape advertises string|number; got: ${
      numericDuration.success ? '' : numericDuration.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    }`,
  );

  const omitted = MediaInput.parse({
    action: 'generate_music',
    project: 'the-audacity',
    episode: 1,
  });
  if (omitted.action !== 'generate_music') throw new Error('expected generate_music');
  assert.ok(
    omitted.duration === 60 || omitted.duration === '60',
    `default should be 60 or "60", got ${JSON.stringify(omitted.duration)}`,
  );

  const shape = z.object(MediaShape).safeParse({
    action: 'generate_music',
    project: 'the-audacity',
    episode: 1,
    duration: 90,
  });
  assert.equal(shape.success, true, 'MediaShape must continue to accept numeric duration');
});

test('AssembleInput accepts mix_audio with project + episode', () => {
  const parsed = AssembleInput.parse({
    action: 'mix_audio',
    project: 'the-audacity',
    episode: '3',
  });
  assert.equal(parsed.action, 'mix_audio');
  if (parsed.action === 'mix_audio') {
    assert.equal(parsed.episode, 3);
  }
});

test('AssembleInput coerces edit_timeline numeric inputs', () => {
  const parsed = AssembleInput.parse({
    action: 'edit_timeline',
    video: 'episode.mp4',
    out: 'timeline.png',
    start: '12.5',
    end: '24',
    width: '1920',
    frames: '10',
    silenceDb: '-28',
    silenceMin: '0.2',
  });

  assert.equal(parsed.action, 'edit_timeline');
  assert.equal(parsed.start, 12.5);
  assert.equal(parsed.end, 24);
  assert.equal(parsed.width, 1920);
  assert.equal(parsed.frames, 10);
  assert.equal(parsed.silenceDb, -28);
  assert.equal(parsed.silenceMin, 0.2);
});
