import assert from 'node:assert/strict';
import test from 'node:test';
import { LineBuffer } from '../src/line-buffer.js';

test('LineBuffer splits on \\n', () => {
  const buf = new LineBuffer();
  assert.deepEqual(buf.push('hello\nworld\n'), ['hello', 'world']);
  assert.equal(buf.flush(), '');
});

test('LineBuffer splits on bare \\r (classic ffmpeg progress)', () => {
  const buf = new LineBuffer();
  const out: string[] = [];
  for (const chunk of [
    'frame=  1 fps=0 time=00:00:00.04\r',
    'frame= 60 fps=60 time=00:00:02.50\r',
    'frame=120 fps=40 time=00:00:05.00\r',
  ]) {
    for (const line of buf.push(chunk)) out.push(line);
  }
  assert.equal(out.length, 3, 'each \\r-terminated ffmpeg stat line should surface immediately');
  for (const line of out) assert.match(line, /^frame=/);
});

test('LineBuffer splits on \\r\\n and does not emit empty line between CR and LF', () => {
  const buf = new LineBuffer();
  assert.deepEqual(buf.push('a\r\nb\r\nc\r\n'), ['a', 'b', 'c']);
  assert.equal(buf.flush(), '');
});

test('LineBuffer handles \\r\\n split across chunk boundary', () => {
  const buf = new LineBuffer();
  const out: string[] = [];
  for (const chunk of ['a\r', '\nb\r\n', 'c\n', 'd']) {
    for (const line of buf.push(chunk)) out.push(line);
  }
  const trailing = buf.flush();
  if (trailing) out.push(trailing);
  assert.deepEqual(out, ['a', 'b', 'c', 'd']);
});

test('LineBuffer flush returns trailing partial line', () => {
  const buf = new LineBuffer();
  assert.deepEqual(buf.push('foo\nbar'), ['foo']);
  assert.equal(buf.flush(), 'bar');
  assert.equal(buf.flush(), '');
});

test('LineBuffer handles interleaved \\r and \\n in same chunk', () => {
  const buf = new LineBuffer();
  assert.deepEqual(buf.push('a\rb\nc\rd\n'), ['a', 'b', 'c', 'd']);
});
