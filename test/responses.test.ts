import assert from 'node:assert/strict';
import test from 'node:test';
import { err, fromHarness, ok } from '../src/responses.js';
import type { HarnessResult } from '../src/harness.js';

test('ok response returns structured success payload', () => {
  const response = ok('created series', {
    paths: { project: 'output/the-audacity' },
  });

  assert.equal(response.isError, undefined);
  const body = response.structuredContent as { ok: boolean; message: string; paths: Record<string, string> };
  assert.equal(body.ok, true);
  assert.equal(body.message, 'created series');
  assert.equal(body.paths.project, 'output/the-audacity');
});

test('err response marks error and includes message', () => {
  const response = err('invalid args for series', { stderrTail: 'project is required' });

  assert.equal(response.isError, true);
  const body = response.structuredContent as { ok: boolean; message: string; stderrTail: string };
  assert.equal(body.ok, false);
  assert.equal(body.message, 'invalid args for series');
  assert.equal(body.stderrTail, 'project is required');
});

test('fromHarness success includes command and duration', () => {
  const result: HarnessResult = {
    ok: true,
    code: 0,
    signal: null,
    stdout: 'done',
    stderr: '',
    command: 'venice-video new-series -n "The Audacity"',
    durationMs: 1234,
  };

  const response = fromHarness(result, 'series created');
  const body = response.structuredContent as { ok: boolean; command: string; durationMs: number };
  assert.equal(body.ok, true);
  assert.equal(body.command, result.command);
  assert.equal(body.durationMs, 1234);
});

test('fromHarness failure includes stderr/stdout tails', () => {
  const result: HarnessResult = {
    ok: false,
    code: 1,
    signal: null,
    stdout: 'line1\nline2\nline3',
    stderr: 'err1\nerr2',
    command: 'venice-video produce-episode -p foo -e 1',
    durationMs: 88,
  };

  const response = fromHarness(result, 'produced episode');
  assert.equal(response.isError, true);
  const body = response.structuredContent as {
    ok: boolean;
    code: number;
    stderrTail: string;
    stdoutTail: string;
  };
  assert.equal(body.ok, false);
  assert.equal(body.code, 1);
  assert.match(body.stderrTail, /err2/);
  assert.match(body.stdoutTail, /line3/);
});
