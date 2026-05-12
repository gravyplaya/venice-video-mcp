import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  extractModelIds,
  extractVoiceIds,
  handleInspect,
  matchCategory,
} from '../src/tools/inspect.js';

async function withWorkspace(testFn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'venice-video-mcp-test-'));
  const previous = process.env.HARNESS_WORKSPACE;
  process.env.HARNESS_WORKSPACE = workspace;
  try {
    await testFn(workspace);
  } finally {
    if (previous === undefined) delete process.env.HARNESS_WORKSPACE;
    else process.env.HARNESS_WORKSPACE = previous;
    await rm(workspace, { recursive: true, force: true });
  }
}

test('inspect list and series return expected metadata', async () => {
  await withWorkspace(async (workspace) => {
    const project = join(workspace, 'output', 'the-audacity');
    await mkdir(project, { recursive: true });
    await writeFile(
      join(project, 'series.json'),
      JSON.stringify({
        name: 'The Audacity',
        slug: 'the-audacity',
        genre: 'satire',
        setting: 'late-night studio',
        aesthetic: { style: 'neo-noir cartoon' },
        storyboardAspectRatio: '16:9',
        characters: [{ name: 'Rin', gender: 'female', locked: true, voiceId: 'voice_123' }],
        episodes: [{ number: 1, title: 'Pilot', status: 'draft' }],
        videoDefaults: {
          actionModel: 'seedance-2-0-image-to-video',
          atmosphereModel: 'seedance-2-0-image-to-video',
          characterConsistencyModel: 'seedance-2-0-reference-to-video',
          lipSyncModel: 'wan-2-7-image-to-video',
          seedanceCompatibility: 'prompt',
          seedanceKeyframeForWan: true,
          imageDefaults: {
            generationModel: 'seedream-v5-lite',
            editModel: 'seedream-v5-lite-edit',
          },
        },
      }),
      'utf8',
    );

    const listResult = await handleInspect({ action: 'list' });
    const listBody = listResult.structuredContent as {
      ok: boolean;
      data: { series: Array<{ slug: string }> };
    };
    assert.equal(listBody.ok, true);
    assert.equal(listBody.data.series.length, 1);
    assert.equal(listBody.data.series[0].slug, 'the-audacity');

    const seriesResult = await handleInspect({ action: 'series', project: 'the-audacity' });
    const seriesBody = seriesResult.structuredContent as {
      ok: boolean;
      data: {
        slug: string;
        characters: Array<{ name: string }>;
        storyboardAspectRatio: string | null;
        videoDefaults: {
          actionModel: string | null;
          lipSyncModel: string | null;
          seedanceCompatibility: string | null;
          seedanceKeyframeForWan: boolean | null;
          imageDefaults: { generationModel: string; editModel: string } | null;
        };
      };
    };
    assert.equal(seriesBody.ok, true);
    assert.equal(seriesBody.data.slug, 'the-audacity');
    assert.equal(seriesBody.data.characters[0].name, 'Rin');
    assert.equal(seriesBody.data.storyboardAspectRatio, '16:9');
    assert.equal(seriesBody.data.videoDefaults.lipSyncModel, 'wan-2-7-image-to-video');
    assert.equal(seriesBody.data.videoDefaults.seedanceCompatibility, 'prompt');
    assert.equal(seriesBody.data.videoDefaults.seedanceKeyframeForWan, true);
    assert.equal(seriesBody.data.videoDefaults.imageDefaults?.editModel, 'seedream-v5-lite-edit');
  });
});

test('inspect episode surfaces v2.1.x script fields and timeline exports', async () => {
  await withWorkspace(async (workspace) => {
    const episodeDir = join(workspace, 'output', 'the-audacity', 'episodes', 'episode-001');
    const sceneDir = join(episodeDir, 'scene-001');
    const audioDir = join(episodeDir, 'audio');
    await mkdir(sceneDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });

    await writeFile(join(workspace, 'output', 'the-audacity', 'series.json'), JSON.stringify({ slug: 'the-audacity' }), 'utf8');
    await writeFile(
      join(episodeDir, 'script.json'),
      JSON.stringify({
        episode: 1,
        title: 'Pilot',
        status: 'approved',
        shots: [{ shotNumber: 1 }, { shotNumber: 2 }],
        musicCues: [
          { startShot: 1, endShot: 2, prompt: 'cold-open sting' },
        ],
        audioMix: { lufsTarget: -16, truePeakDb: -1 },
      }),
      'utf8',
    );
    await writeFile(join(episodeDir, 'script-approved.json'), '{}', 'utf8');
    await writeFile(join(episodeDir, 'qa-approved.json'), '{}', 'utf8');
    await writeFile(join(episodeDir, 'episode-001-final.mp4'), '', 'utf8');
    await writeFile(join(episodeDir, 'episode-001.fcpxml'), '<fcpxml/>', 'utf8');
    await writeFile(join(episodeDir, 'episode-001.premiere.xml'), '<xmeml/>', 'utf8');
    await writeFile(join(episodeDir, 'episode-001.resolve.fcpxml'), '<fcpxml/>', 'utf8');
    await writeFile(join(sceneDir, 'shot-001-panel.png'), 'fake', 'utf8');
    await writeFile(join(audioDir, 'ambient-rain-heavy.mp3'), '', 'utf8');
    await writeFile(join(audioDir, 'ambient-crowd.mp3'), '', 'utf8');
    await writeFile(join(audioDir, 'music.mp3'), '', 'utf8');

    const episodeResult = await handleInspect({
      action: 'episode',
      project: 'the-audacity',
      episode: 1,
    });
    const episodeBody = episodeResult.structuredContent as {
      ok: boolean;
      data: {
        approved: boolean;
        qaApproved: boolean;
        shotCount: number;
        finalVideo: string | null;
        timelineExports: string[];
        musicCueCount: number | null;
        audioMix: boolean;
        status: string | null;
        ambientLayers: string[];
        hasMusic: boolean;
      };
    };
    assert.equal(episodeBody.ok, true);
    assert.equal(episodeBody.data.approved, true);
    assert.equal(episodeBody.data.qaApproved, true);
    assert.equal(episodeBody.data.shotCount, 2);
    assert.equal(episodeBody.data.musicCueCount, 1);
    assert.equal(episodeBody.data.audioMix, true);
    assert.equal(episodeBody.data.status, 'approved');
    assert.match(episodeBody.data.finalVideo ?? '', /episode-001-final\.mp4$/);
    const exports = episodeBody.data.timelineExports.slice().sort();
    assert.deepEqual(exports, [
      'episode-001.fcpxml',
      'episode-001.premiere.xml',
      'episode-001.resolve.fcpxml',
    ]);
    assert.deepEqual(episodeBody.data.ambientLayers, ['crowd', 'rain-heavy']);
    assert.equal(episodeBody.data.hasMusic, true);

    const shotResult = await handleInspect({
      action: 'shot',
      project: 'the-audacity',
      episode: 1,
      shot: 1,
    });
    const shotBody = shotResult.structuredContent as {
      ok: boolean;
      data: { files: string[] };
    };
    assert.equal(shotBody.ok, true);
    assert.deepEqual(shotBody.data.files, ['shot-001-panel.png']);
  });
});

test('extractModelIds covers id-prefixed entries and bare-string arrays', () => {
  const fixture = `
    export const VIDEO_MODELS = [
      { id: 'happyhorse-1-0-text-to-video', name: 'HappyHorse 1.0' },
      { id: 'kling-o3-4k-image-to-video', name: 'Kling O3 4K' },
      { id: 'wan-2-7-image-to-video', name: 'Wan 2.7' },
      { id: 'seedance-2-0-reference-to-video', name: 'Seedance 2.0 R2V' },
    ];
    export const IMAGE_GENERATION_MODELS = [
      { id: 'lustify-v7', name: 'Lustify V7' },
      { id: 'bria-bg-remover', name: 'Bria BG Remover' },
      { id: 'gpt-image-2', name: 'GPT Image 2' },
    ];
    export const MULTI_EDIT_MODELS = [
      'gpt-image-2-edit',
      'nano-banana-pro-edit',
      'seedream-v5-lite-edit',
    ] as const;
    export const TTS_MODELS = ['tts-kokoro', 'tts-qwen3-1-7b'] as const;
  `;

  const ids = extractModelIds(fixture);
  for (const expected of [
    'happyhorse-1-0-text-to-video',
    'kling-o3-4k-image-to-video',
    'wan-2-7-image-to-video',
    'seedance-2-0-reference-to-video',
    'lustify-v7',
    'bria-bg-remover',
    'gpt-image-2',
    'gpt-image-2-edit',
    'nano-banana-pro-edit',
    'seedream-v5-lite-edit',
    'tts-kokoro',
    'tts-qwen3-1-7b',
  ]) {
    assert.ok(ids.includes(expected), `expected ${expected} in ids`);
  }
});

test('matchCategory routes new image families and edit/tts arrays correctly', () => {
  assert.equal(matchCategory('happyhorse-1-0-text-to-video', 'video'), true);
  assert.equal(matchCategory('wan-2-7-image-to-video', 'video'), true);
  assert.equal(matchCategory('seedance-2-0-reference-to-video', 'video'), true);
  assert.equal(matchCategory('lustify-v7', 'image'), true);
  assert.equal(matchCategory('bria-bg-remover', 'image'), true);
  assert.equal(matchCategory('gpt-image-2', 'image'), true);
  assert.equal(matchCategory('gpt-image-2-edit', 'edit'), true);
  assert.equal(matchCategory('gpt-image-2-edit', 'image'), false);
  assert.equal(matchCategory('wai-Illustrious', 'image'), true);
  assert.equal(matchCategory('seedream-v5-lite-edit', 'edit'), true);
  assert.equal(matchCategory('seedream-v5-lite-edit', 'image'), false);
  assert.equal(matchCategory('tts-kokoro', 'tts'), true);
  assert.equal(matchCategory('elevenlabs-music', 'music'), true);
  assert.equal(matchCategory('mmaudio-v2-text-to-audio', 'sfx'), true);
});

test('extractVoiceIds picks up Kokoro buildVoiceGroup arrays and Qwen3 entries', () => {
  const fixture = `
    function buildKokoroVoices() {
      return [
        ...buildVoiceGroup('tts-kokoro', 'American English', 'female', [
          'af_alloy', 'af_bella',
        ]),
        ...buildVoiceGroup('tts-kokoro', 'British English', 'male', ['bm_daniel']),
      ];
    }
    function buildQwen3Voices() {
      return [
        { voice_id: 'Vivian', name: 'Vivian', category: 'tts-qwen3-1-7b',
          labels: { gender: 'female', age: 'adult', language: 'English' } },
      ];
    }
  `;

  const ids = extractVoiceIds(fixture);
  for (const expected of ['af_alloy', 'af_bella', 'bm_daniel', 'Vivian']) {
    assert.ok(ids.includes(expected), `expected ${expected} in voice ids`);
  }
});
