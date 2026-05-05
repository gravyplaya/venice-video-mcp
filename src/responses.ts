import type { HarnessResult } from './harness.js';

export interface CompactOk {
  ok: true;
  message: string;
  paths?: Record<string, string>;
  data?: Record<string, unknown>;
  durationMs?: number;
  command?: string;
}

export interface CompactErr {
  ok: false;
  message: string;
  command?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  stderrTail?: string;
  stdoutTail?: string;
  durationMs?: number;
}

export type CompactResult = CompactOk | CompactErr;

export interface ToolContent {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

export function ok(message: string, extra: Partial<CompactOk> = {}): ToolContent {
  const body: CompactOk = { ok: true, message, ...extra };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    structuredContent: body as unknown as Record<string, unknown>,
  };
}

export function err(message: string, extra: Partial<CompactErr> = {}): ToolContent {
  const body: CompactErr = { ok: false, message, ...extra };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    isError: true,
    structuredContent: body as unknown as Record<string, unknown>,
  };
}

export function fromHarness(
  result: HarnessResult,
  successMessage: string,
  successExtra: Partial<CompactOk> = {},
): ToolContent {
  if (result.ok) {
    return ok(successMessage, {
      ...successExtra,
      durationMs: result.durationMs,
      command: result.command,
    });
  }
  return err(`harness command failed (exit ${result.code ?? 'null'})`, {
    command: result.command,
    code: result.code,
    signal: result.signal,
    stdoutTail: tail(result.stdout, 30),
    stderrTail: tail(result.stderr, 30),
    durationMs: result.durationMs,
  });
}

function tail(s: string, lines: number): string {
  const arr = s.split('\n');
  return arr.slice(Math.max(0, arr.length - lines)).join('\n').trim();
}
