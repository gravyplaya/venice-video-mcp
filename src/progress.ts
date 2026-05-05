import type { Notification } from '@modelcontextprotocol/sdk/types.js';

export type SendNotification = (notification: Notification) => Promise<void>;

export interface ProgressCtx {
  progressToken?: string | number;
  send?: SendNotification;
  signal?: AbortSignal;
}

export interface ProgressEmitter {
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  total?: number;
}

interface ParsedShotProgress {
  current: number;
  total: number;
  message: string;
}

const SHOT_PATTERNS: RegExp[] = [
  new RegExp('\\bshot[\\s_-]?(\\d+)\\s*(?:of|/)\\s*(\\d+)', 'i'),
  new RegExp('\\b(\\d+)\\s*/\\s*(\\d+)\\s+shots?\\b', 'i'),
  new RegExp('\\bgenerating shot\\s+(\\d+)\\s+of\\s+(\\d+)', 'i'),
  new RegExp('\\bunit\\s+(\\d+)\\s*/\\s*(\\d+)', 'i'),
  new RegExp('\\bpanel\\s+(\\d+)\\s*/\\s*(\\d+)', 'i'),
];

const QUEUE_PATTERN = new RegExp(
  '\\b(queued|polling|retrieving|completing)\\b.*?(?:job|task)?\\s*([a-f0-9-]{8,})?',
  'i',
);
const FFMPEG_TIME_PATTERN = /\btime=(\d{2}):(\d{2}):(\d{2})/;
const PERCENT_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*%/;

export function makeProgressEmitter(ctx: ProgressCtx): ProgressEmitter {
  const { progressToken, send } = ctx;
  let lastSentMs = 0;
  let lastProgress = 0;

  const emit = async (progress: number, message: string, total?: number) => {
    if (!progressToken || !send) return;
    const now = Date.now();
    if (now - lastSentMs < 250 && progress === lastProgress) return;
    lastSentMs = now;
    lastProgress = progress;
    try {
      await send({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress,
          ...(total !== undefined ? { total } : {}),
          message: truncate(message, 240),
        },
      });
    } catch {
    }
  };

  const onLine = (rawLine: string, stream: 'stdout' | 'stderr') => {
    const line = rawLine.trim();
    if (!line) return;

    const shot = parseShotProgress(line);
    if (shot) {
      void emit(shot.current, shot.message, shot.total);
      return;
    }

    const ffmpeg = parseFfmpegProgress(line);
    if (ffmpeg !== null) {
      void emit(ffmpeg, line, 100);
      return;
    }

    const pct = parsePercent(line);
    if (pct !== null) {
      void emit(pct, line, 100);
      return;
    }

    if (QUEUE_PATTERN.test(line) || /^\s*\[/.test(line)) {
      void emit(lastProgress, line);
      return;
    }
  };

  return { onLine };
}

function parseShotProgress(line: string): ParsedShotProgress | null {
  for (const re of SHOT_PATTERNS) {
    const m = line.match(re);
    if (m) {
      const current = parseInt(m[1], 10);
      const total = parseInt(m[2], 10);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return { current, total, message: line };
      }
    }
  }
  return null;
}

function parseFfmpegProgress(line: string): number | null {
  if (!line.includes('frame=') && !line.includes('time=')) return null;
  const m = line.match(FFMPEG_TIME_PATTERN);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  return h * 3600 + mm * 60 + s;
}

function parsePercent(line: string): number | null {
  const m = line.match(PERCENT_PATTERN);
  if (!m) return null;
  const p = parseFloat(m[1]);
  if (!Number.isFinite(p) || p < 0 || p > 100) return null;
  return p;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}
