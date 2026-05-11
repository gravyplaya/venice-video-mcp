import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { resolveWorkspacePath } from '../src/config.js';
import { buildHarnessEnv } from '../src/harness.js';

async function withWorkspace(testFn: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'venice-video-mcp-sec-test-'));
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

test('resolveWorkspacePath rejects symlink escape paths', async () => {
  await withWorkspace(async (workspace) => {
    const outside = await mkdtemp(join(tmpdir(), 'venice-video-mcp-sec-out-'));
    try {
      await symlink(outside, join(workspace, 'outside-link'));
      assert.throws(
        () => resolveWorkspacePath('outside-link/secret.txt'),
        /must resolve inside HARNESS_WORKSPACE after symlink resolution/i,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test('resolveWorkspacePath allows unresolved paths under workspace', async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(join(workspace, 'episodes'), { recursive: true });
    const resolved = resolveWorkspacePath('episodes/new-file.txt');
    assert.equal(resolved, join(workspace, 'episodes', 'new-file.txt'));
  });
});

test('buildHarnessEnv returns allowlisted environment and explicit overrides', () => {
  const originalPath = process.env.PATH;
  const originalHome = process.env.HOME;
  const originalApiKey = process.env.VENICE_API_KEY;
  const originalSecret = process.env.UNRELATED_SECRET;
  process.env.PATH = '/usr/bin:/bin';
  process.env.HOME = '/tmp/home';
  process.env.VENICE_API_KEY = 'vn_test_key';
  process.env.UNRELATED_SECRET = 'should_not_leak';

  try {
    const env = buildHarnessEnv({ CUSTOM_FLAG: '1' });
    assert.equal(env.PATH, '/usr/bin:/bin');
    assert.equal(env.HOME, '/tmp/home');
    assert.equal(env.VENICE_API_KEY, 'vn_test_key');
    assert.equal(env.CUSTOM_FLAG, '1');
    assert.equal(env.UNRELATED_SECRET, undefined);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;

    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;

    if (originalApiKey === undefined) delete process.env.VENICE_API_KEY;
    else process.env.VENICE_API_KEY = originalApiKey;

    if (originalSecret === undefined) delete process.env.UNRELATED_SECRET;
    else process.env.UNRELATED_SECRET = originalSecret;
  }
});
