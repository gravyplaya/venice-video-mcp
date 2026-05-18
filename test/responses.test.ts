import assert from 'node:assert/strict';
import test from 'node:test';
import { err, extractWarnings, fromHarness, ok } from '../src/responses.js';
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

test('extractWarnings catches silent rejection, auto-snap, fallback, deprecation, padding, rate limit', () => {
  const stdout = [
    'shot 1 of 8 rendering',
    'silent rejection detected, retry 1/3',
    'silent rejection detected, retry 2/3',
    'duration auto-snapped 7s -> 8s for veo3.1-fast-image-to-video',
    'padded audio_url 2.40s -> 3.00s',
    'shot 1 of 8 complete',
    '⚠ Seedance R2V keyframe pipeline failed (compatibility rejection); falling back to panel-anchored single-pass render.',
    'all shots rendered',
  ].join('\n');
  const stderr = [
    'x-venice-model-deprecation-warning: qwen-2.5-vl retires 2025-09-22',
    'WARN: HTTP 429 rate-limit, retrying in 8s',
  ].join('\n');

  const warnings = extractWarnings(stdout, stderr);
  // stderr is scanned first.
  assert.match(warnings[0], /deprecation/i);
  assert.ok(warnings.some((w) => /silent rejection/i.test(w)));
  assert.ok(warnings.some((w) => /retry 1\/3/.test(w)));
  assert.ok(warnings.some((w) => /retry 2\/3/.test(w)));
  assert.ok(warnings.some((w) => /auto-snapped/i.test(w)));
  assert.ok(warnings.some((w) => /padded audio_url/i.test(w)));
  assert.ok(warnings.some((w) => /falling back/i.test(w)));
  assert.ok(warnings.some((w) => /rate-limit|429/.test(w)));
  // Benign progress lines must NOT be flagged.
  assert.ok(!warnings.some((w) => /shot 1 of 8 (rendering|complete)/.test(w)));
  assert.ok(!warnings.some((w) => /all shots rendered/.test(w)));
});

test('extractWarnings dedupes exact-duplicate lines and caps at 12 entries', () => {
  const stdout = Array.from({ length: 20 }, () => 'silent rejection detected, retry 1/3').join('\n');
  const warnings = extractWarnings(stdout, '');
  assert.equal(warnings.length, 1, 'identical lines should collapse');

  const distinct = Array.from(
    { length: 30 },
    (_, i) => `silent rejection detected, retry ${i + 1}/30`,
  ).join('\n');
  const capped = extractWarnings(distinct, '');
  assert.equal(capped.length, 12, 'cap at 12 to avoid drowning the agent');
});

test('extractWarnings returns [] for clean output', () => {
  const stdout = [
    'shot 1 of 4 rendering',
    'unit 1 of 2 (covers shots 1-2)',
    'LUFS final pass: integrated -16.0 / true-peak -1.0',
    'wrote episode-001-final.mp4',
  ].join('\n');
  const warnings = extractWarnings(stdout, '');
  assert.deepEqual(warnings, []);
});

test('fromHarness success surfaces warnings + stderrTail when harness emitted them', () => {
  const result: HarnessResult = {
    ok: true,
    code: 0,
    signal: null,
    stdout: 'shot 1 of 4\nsilent rejection detected, retry 1/3\nshot 1 of 4 complete',
    stderr: 'WARN: HTTP 429 rate-limit, retrying in 8s\nshot resumed',
    command: 'venice-video generate-videos -p foo -e 1',
    durationMs: 42_000,
  };

  const response = fromHarness(result, 'generated videos for episode 1');
  assert.equal(response.isError, undefined);
  const body = response.structuredContent as {
    ok: boolean;
    message: string;
    warnings: string[];
    stderrTail: string;
  };
  assert.equal(body.ok, true);
  assert.match(body.message, /\(with 2 warnings — see warnings\[\]\)/);
  assert.equal(body.warnings.length, 2);
  assert.match(body.stderrTail, /rate-limit/);
});

test('fromHarness success with no warnings keeps the original lean shape', () => {
  const result: HarnessResult = {
    ok: true,
    code: 0,
    signal: null,
    stdout: 'all shots rendered cleanly',
    stderr: '',
    command: 'venice-video generate-videos -p foo -e 1',
    durationMs: 12_000,
  };

  const response = fromHarness(result, 'generated videos for episode 1');
  const body = response.structuredContent as {
    ok: boolean;
    message: string;
    warnings?: string[];
    stderrTail?: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.message, 'generated videos for episode 1');
  assert.equal(body.warnings, undefined);
  assert.equal(body.stderrTail, undefined);
});

test('fromHarness failure includes warnings extracted from harness output', () => {
  const result: HarnessResult = {
    ok: false,
    code: 1,
    signal: null,
    stdout: 'silent rejection persisted after 3 retries',
    stderr: 'WARN: upstream Venice returning empty bodies',
    command: 'venice-video generate-videos -p foo -e 1',
    durationMs: 90_000,
  };

  const response = fromHarness(result, 'generated videos for episode 1');
  assert.equal(response.isError, true);
  const body = response.structuredContent as {
    ok: boolean;
    warnings: string[];
    stderrTail: string;
  };
  assert.ok(Array.isArray(body.warnings) && body.warnings.length >= 2);
  assert.ok(body.warnings.some((w) => /silent rejection/i.test(w)));
});
