/**
 * Streaming line splitter that surfaces lines on '\n', '\r\n', and bare '\r'.
 *
 * The harness pipes child stdout/stderr through this so that classic
 * ffmpeg-style progress (each stat update terminated by '\r' so the previous
 * one is overwritten on a TTY) is split into discrete lines instead of being
 * accumulated into a single multi-megabyte buffer that only flushes when the
 * encode finishes. Without this, `makeProgressEmitter` never sees a line
 * during long ffmpeg runs and MCP clients receive zero progress notifications.
 *
 * '\r\n' that straddles a chunk boundary is handled by tracking whether the
 * previous chunk ended in a bare CR (`pendingCr`). The leading '\n' of the
 * next chunk is then consumed as part of the same line break. Consumers
 * filter empty lines anyway (`progress.ts` trims and bails on empty input),
 * so a stray empty emission from an out-of-band LF is harmless.
 */
export class LineBuffer {
  private buf = '';
  private pendingCr = false;

  push(chunk: string): string[] {
    if (!chunk) return [];
    let start = 0;
    if (this.pendingCr) {
      this.pendingCr = false;
      if (chunk.charCodeAt(0) === 0x0a) {
        start = 1;
        if (start >= chunk.length) return [];
      }
    }
    this.buf += chunk.slice(start);
    const out: string[] = [];
    let cursor = 0;
    let i = 0;
    const len = this.buf.length;
    while (i < len) {
      const c = this.buf.charCodeAt(i);
      if (c === 0x0a /* \n */) {
        out.push(this.buf.slice(cursor, i));
        cursor = i + 1;
        i = cursor;
        continue;
      }
      if (c === 0x0d /* \r */) {
        out.push(this.buf.slice(cursor, i));
        if (i + 1 < len && this.buf.charCodeAt(i + 1) === 0x0a) {
          cursor = i + 2;
        } else if (i + 1 >= len) {
          this.pendingCr = true;
          cursor = i + 1;
        } else {
          cursor = i + 1;
        }
        i = cursor;
        continue;
      }
      i++;
    }
    this.buf = this.buf.slice(cursor);
    return out;
  }

  flush(): string {
    const remaining = this.buf;
    this.buf = '';
    this.pendingCr = false;
    return remaining;
  }
}
