import assert from 'node:assert/strict';
import test from 'node:test';
import { AssembleInput, EpisodeInput, SeriesInput } from '../src/schemas.js';

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
