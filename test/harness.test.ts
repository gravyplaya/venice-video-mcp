import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeProgressSafely } from '../src/harness.js';

test('invokeProgressSafely returns early when no callback is provided', () => {
  assert.doesNotThrow(() => invokeProgressSafely(undefined, 'anything', 'stdout'));
});

test('invokeProgressSafely swallows synchronous errors from the callback', () => {
  let calls = 0;
  const cb = () => {
    calls++;
    throw new Error('boom');
  };
  assert.doesNotThrow(() => invokeProgressSafely(cb, 'shot 1 of 3', 'stdout'));
  assert.doesNotThrow(() => invokeProgressSafely(cb, 'shot 2 of 3', 'stdout'));
  assert.doesNotThrow(() => invokeProgressSafely(cb, 'shot 3 of 3', 'stdout'));
  assert.equal(calls, 3, 'every line should still reach the callback');
});

test('invokeProgressSafely forwards both line and stream args', () => {
  const observed: Array<[string, 'stdout' | 'stderr']> = [];
  const cb = (line: string, stream: 'stdout' | 'stderr') => {
    observed.push([line, stream]);
  };
  invokeProgressSafely(cb, 'first', 'stdout');
  invokeProgressSafely(cb, 'second', 'stderr');
  assert.deepEqual(observed, [
    ['first', 'stdout'],
    ['second', 'stderr'],
  ]);
});
