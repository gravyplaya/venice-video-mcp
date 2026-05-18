import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  extractModelIds,
  extractVoiceIds,
  filterLiveModels,
  handleInspect,
  matchCategory,
  parseLiveModels,
  type LiveModel,
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

test('parseLiveModels extracts ids, traits, vision capability, deprecation, and pricing', () => {
  const payload = {
    data: [
      {
        id: 'qwen3-6-27b',
        model_spec: {
          name: 'Qwen 3.6 27B',
          traits: [],
          capabilities: { supportsVision: true },
          pricing: { input: { usd: 0.325 }, output: { usd: 3.25 } },
        },
        type: 'text',
      },
      {
        id: 'qwen3-vl-235b-a22b',
        model_spec: {
          name: 'Qwen3 VL 235B',
          traits: ['default_vision'],
          capabilities: { supportsVision: true },
          pricing: { input: { usd: 0.25 }, output: { usd: 1.5 } },
        },
        type: 'text',
      },
      {
        id: 'zai-org-glm-4.7',
        model_spec: {
          name: 'GLM 4.7',
          traits: ['default', 'most_intelligent'],
          capabilities: { supportsVision: false },
          pricing: { input: { usd: 0.55 }, output: { usd: 2.65 } },
        },
        type: 'text',
      },
      {
        id: 'qwen-2.5-vl',
        model_spec: {
          name: 'Qwen 2.5 VL',
          traits: [],
          capabilities: { supportsVision: true },
          deprecation: { date: '2025-09-22T00:00:00.000Z' },
          pricing: { input: { usd: 0.4 }, output: { usd: 1.2 } },
        },
        type: 'text',
      },
      'not-a-model',
      { id: 12345 },
      { id: 'no-spec' },
    ],
  };

  const parsed = parseLiveModels(payload);
  assert.equal(parsed.length, 5);

  const qwenVl = parsed.find((m) => m.id === 'qwen3-vl-235b-a22b');
  assert.ok(qwenVl);
  assert.equal(qwenVl?.supportsVision, true);
  assert.deepEqual(qwenVl?.traits, ['default_vision']);
  assert.equal(qwenVl?.deprecationDate, null);
  assert.equal(qwenVl?.pricing.inputUsd, 0.25);

  const deprecated = parsed.find((m) => m.id === 'qwen-2.5-vl');
  assert.ok(deprecated);
  assert.equal(deprecated?.deprecationDate, '2025-09-22T00:00:00.000Z');

  const visionOnly = filterLiveModels(parsed, 'vision');
  assert.deepEqual(
    visionOnly.map((m) => m.id).sort(),
    ['qwen-2.5-vl', 'qwen3-6-27b', 'qwen3-vl-235b-a22b'],
  );

  const allCategory = filterLiveModels(parsed, 'all');
  assert.equal(allCategory.length, 5);

  const noMatch: LiveModel[] = [];
  assert.equal(filterLiveModels(noMatch, 'vision').length, 0);
});

test('parseLiveModels tolerates non-object payloads and missing data array', () => {
  assert.deepEqual(parseLiveModels(null), []);
  assert.deepEqual(parseLiveModels({}), []);
  assert.deepEqual(parseLiveModels({ data: null }), []);
  assert.deepEqual(parseLiveModels({ data: 'oops' }), []);
});

test('inspect.models with category=vision but live=false returns guidance error', async () => {
  const result = await handleInspect({
    action: 'models',
    category: 'vision',
    live: false,
  });
  const body = result.structuredContent as { ok: boolean; message: string };
  assert.equal(body.ok, false);
  assert.match(body.message, /vision.*live: true/i);
});

test('inspect voices filters ids by requested provider', async () => {
  const harness = await mkdtemp(join(tmpdir(), 'venice-video-mcp-harness-'));
  const previousHarnessPath = process.env.HARNESS_PATH;
  process.env.HARNESS_PATH = harness;
  try {
    const veniceDir = join(harness, 'src', 'venice');
    await mkdir(veniceDir, { recursive: true });
    await writeFile(
      join(veniceDir, 'voices.ts'),
      `
        export function buildKokoroVoices() {
          return [
            ...buildVoiceGroup('tts-kokoro', 'American English', 'female', [
              'af_alloy', 'af_bella',
            ]),
          ];
        }
        export function buildQwen3Voices() {
          return [
            { voice_id: 'Vivian', provider_id: 'not_a_voice', name: 'Vivian' },
          ];
        }
      `,
      'utf8',
    );

    const kokoroResult = await handleInspect({ action: 'voices', provider: 'kokoro' });
    const kokoroBody = kokoroResult.structuredContent as {
      ok: boolean;
      data: { ids: string[]; count: number; provider: string };
    };
    assert.equal(kokoroBody.ok, true);
    assert.equal(kokoroBody.data.provider, 'kokoro');
    assert.deepEqual(kokoroBody.data.ids, ['af_alloy', 'af_bella']);
    assert.equal(kokoroBody.data.count, 2);

    const qwen3Result = await handleInspect({ action: 'voices', provider: 'qwen3' });
    const qwen3Body = qwen3Result.structuredContent as {
      ok: boolean;
      data: { ids: string[]; count: number; provider: string };
    };
    assert.equal(qwen3Body.ok, true);
    assert.equal(qwen3Body.data.provider, 'qwen3');
    assert.deepEqual(qwen3Body.data.ids, ['Vivian']);
    assert.equal(qwen3Body.data.count, 1);

    const allResult = await handleInspect({ action: 'voices', provider: 'all' });
    const allBody = allResult.structuredContent as {
      ok: boolean;
      data: { ids: string[]; count: number; provider: string };
    };
    assert.equal(allBody.ok, true);
    assert.equal(allBody.data.provider, 'all');
    assert.deepEqual(allBody.data.ids, ['Vivian', 'af_alloy', 'af_bella']);
    assert.equal(allBody.data.count, 3);
  } finally {
    if (previousHarnessPath === undefined) delete process.env.HARNESS_PATH;
    else process.env.HARNESS_PATH = previousHarnessPath;
    await rm(harness, { recursive: true, force: true });
  }
});
