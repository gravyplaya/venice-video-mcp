import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProgressEmitter } from '../src/progress.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('progress emitter sends shot progress notifications', async () => {
  const seen: Array<{ method?: string; params?: Record<string, unknown> }> = [];
  const emitter = makeProgressEmitter({
    progressToken: 'tok',
    send: async (notification) => {
      seen.push(notification as { method?: string; params?: Record<string, unknown> });
    },
  });

  emitter.onLine('Generating shot 2 of 10', 'stdout');
  await flush();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'notifications/progress');
  assert.equal(seen[0].params?.progress, 2);
  assert.equal(seen[0].params?.total, 10);
});

test('progress emitter parses ffmpeg and percent progress', async () => {
  const seen: Array<{ params?: Record<string, unknown> }> = [];
  const emitter = makeProgressEmitter({
    progressToken: 42,
    send: async (notification) => {
      seen.push(notification as { params?: Record<string, unknown> });
    },
  });

  emitter.onLine('frame= 120 fps=29.97 q=31.0 size=1024kB time=00:00:12 bitrate=700kbits/s', 'stderr');
  emitter.onLine('render step 45% complete', 'stdout');
  await flush();

  assert.equal(seen.length, 2);
  assert.equal(seen[0].params?.progress, 12);
  assert.equal(seen[0].params?.total, undefined);
  assert.equal(seen[1].params?.progress, 45);
  assert.equal(seen[1].params?.total, 100);
});

test('progress emitter ignores time= timestamps without ffmpeg frame=', async () => {
  const seen: Array<{ params?: Record<string, unknown> }> = [];
  const emitter = makeProgressEmitter({
    progressToken: 'tok',
    send: async (notification) => {
      seen.push(notification as { params?: Record<string, unknown> });
    },
  });

  emitter.onLine('Tool log: estimated time=01:05:07 remaining', 'stderr');
  await flush();

  assert.equal(seen.length, 0);
});

test('progress emitter does not treat ffmpeg elapsed seconds as a percentage', async () => {
  const seen: Array<{ params?: Record<string, unknown> }> = [];
  const emitter = makeProgressEmitter({
    progressToken: 'tok',
    send: async (notification) => {
      seen.push(notification as { params?: Record<string, unknown> });
    },
  });

  emitter.onLine(
    'frame= 100 fps=25 q=28.0 size=2048kB time=00:02:05 bitrate=700kbits/s',
    'stderr',
  );
  await flush();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].params?.progress, 125);
  assert.equal(seen[0].params?.total, undefined);
});

test('progress emitter is inert without token/send', () => {
  const emitter = makeProgressEmitter({});
  emitter.onLine('Generating shot 1 of 4', 'stdout');
  emitter.onLine('95%', 'stderr');
  assert.ok(true);
});
