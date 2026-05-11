import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { handleInspect } from '../src/tools/inspect.js';

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
        characters: [{ name: 'Rin', gender: 'female', locked: true, voiceId: 'voice_123' }],
        episodes: [{ number: 1, title: 'Pilot', status: 'draft' }],
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
      data: { slug: string; characters: Array<{ name: string }> };
    };
    assert.equal(seriesBody.ok, true);
    assert.equal(seriesBody.data.slug, 'the-audacity');
    assert.equal(seriesBody.data.characters[0].name, 'Rin');
  });
});

test('inspect episode and shot summarize generated files', async () => {
  await withWorkspace(async (workspace) => {
    const episodeDir = join(workspace, 'output', 'the-audacity', 'episodes', 'episode-001');
    const sceneDir = join(episodeDir, 'scene-001');
    await mkdir(sceneDir, { recursive: true });

    await writeFile(join(workspace, 'output', 'the-audacity', 'series.json'), JSON.stringify({ slug: 'the-audacity' }), 'utf8');
    await writeFile(join(episodeDir, 'script.json'), JSON.stringify({ shots: [{}, {}] }), 'utf8');
    await writeFile(join(episodeDir, 'script-approved.json'), '{}', 'utf8');
    await writeFile(join(episodeDir, 'qa-approved.json'), '{}', 'utf8');
    await writeFile(join(episodeDir, 'episode-001-final.mp4'), '', 'utf8');
    await writeFile(join(sceneDir, 'shot-001-panel.png'), 'fake', 'utf8');

    const episodeResult = await handleInspect({
      action: 'episode',
      project: 'the-audacity',
      episode: 1,
    });
    const episodeBody = episodeResult.structuredContent as {
      ok: boolean;
      data: { approved: boolean; qaApproved: boolean; shotCount: number; finalVideo: string | null };
    };
    assert.equal(episodeBody.ok, true);
    assert.equal(episodeBody.data.approved, true);
    assert.equal(episodeBody.data.qaApproved, true);
    assert.equal(episodeBody.data.shotCount, 2);
    assert.match(episodeBody.data.finalVideo ?? '', /episode-001-final\.mp4$/);

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
