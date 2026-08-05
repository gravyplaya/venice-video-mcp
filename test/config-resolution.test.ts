// Tests for how the MCP server resolves which harness binary to run.
//
// The bug this guards against: a config that set only HARNESS_PATH silently ran
// a `venice-video` on PATH instead — usually a stale, separately-versioned
// global install. Setting HARNESS_PATH is a statement of intent, so it must
// outrank an ambient PATH binary. Order under test: HARNESS_BIN, then
// HARNESS_PATH/dist, then PATH.

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveHarnessConfig } from '../src/config.js';

/** Run `fn` with a controlled process.env, restoring it afterward. */
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const keys = ['HARNESS_BIN', 'HARNESS_PATH', 'HARNESS_WORKSPACE'];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  try {
    for (const k of keys) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function scratch(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'vv-mcp-config-')));
}

/** Build a fake harness checkout with a built dist entry. */
function fakeHarnessPath(root: string): string {
  const dir = join(root, 'harness');
  mkdirSync(join(dir, 'dist', 'mini-drama'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'mini-drama', 'cli.js'), '');
  return dir;
}

test('HARNESS_PATH outranks a venice-video on PATH', () => {
  const root = scratch();
  const harness = fakeHarnessPath(root);
  // A `venice-video` almost certainly exists on this machine's PATH; HARNESS_PATH
  // must win regardless.
  withEnv({ HARNESS_PATH: harness, HARNESS_WORKSPACE: root, HARNESS_BIN: undefined }, () => {
    const cfg = resolveHarnessConfig();
    assert.equal(cfg.bin, 'node');
    assert.deepEqual(cfg.args, [join(harness, 'dist/mini-drama/cli.js')]);
  });
});

test('HARNESS_BIN outranks HARNESS_PATH', () => {
  const root = scratch();
  const harness = fakeHarnessPath(root);
  const explicit = join(root, 'explicit-cli.js');
  writeFileSync(explicit, '');
  withEnv({ HARNESS_BIN: explicit, HARNESS_PATH: harness, HARNESS_WORKSPACE: root }, () => {
    const cfg = resolveHarnessConfig();
    assert.equal(cfg.bin, 'node');
    assert.deepEqual(cfg.args, [explicit]);
  });
});

test('a HARNESS_PATH without a built dist is a surfaced error, not a silent fallthrough', () => {
  const root = scratch();
  const unbuilt = join(root, 'unbuilt');
  mkdirSync(unbuilt, { recursive: true });
  withEnv({ HARNESS_PATH: unbuilt, HARNESS_WORKSPACE: root, HARNESS_BIN: undefined }, () => {
    assert.throws(() => resolveHarnessConfig(), /does not exist/);
  });
});
