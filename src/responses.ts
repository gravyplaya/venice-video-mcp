import type { HarnessResult } from './harness.js';

export interface CompactOk {
  ok: true;
  message: string;
  paths?: Record<string, string>;
  data?: Record<string, unknown>;
  warnings?: string[];
  stdoutTail?: string;
  stderrTail?: string;
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
  warnings?: string[];
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
  const warnings = extractWarnings(result.stdout, result.stderr);
  if (result.ok) {
    const successBody: Partial<CompactOk> = {
      ...successExtra,
      durationMs: result.durationMs,
      command: result.command,
    };
    if (warnings.length) {
      // The harness succeeded but emitted noteworthy lines (silent-rejection
      // retries, duration auto-snaps, Wan keyframe fallbacks, deprecation
      // warnings from Venice, …). Surface them so the agent doesn't blindly
      // trust an `ok:true` and re-queue a known-degraded run. Also include a
      // small stderr tail so the agent has context for the warning.
      successBody.warnings = warnings;
      const stderrSnippet = tail(result.stderr, 15);
      if (stderrSnippet) successBody.stderrTail = stderrSnippet;
    }
    let message = successMessage;
    if (warnings.length) {
      const suffix = warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`;
      message = `${successMessage} (with ${suffix} — see warnings[])`;
    }
    return ok(message, successBody);
  }
  return err(`harness command failed (exit ${result.code ?? 'null'})`, {
    command: result.command,
    code: result.code,
    signal: result.signal,
    stdoutTail: tail(result.stdout, 30),
    stderrTail: tail(result.stderr, 30),
    warnings: warnings.length ? warnings : undefined,
    durationMs: result.durationMs,
  });
}

function tail(s: string, lines: number): string {
  const arr = s.split('\n');
  return arr.slice(Math.max(0, arr.length - lines)).join('\n').trim();
}

// Patterns the harness emits when something didn't go cleanly but the run
// continued. We surface these even on success because they typically signal
// degraded output (e.g. Wan keyframe pipeline fell back, Venice routed away
// from the requested model, the silent-rejection guard retried) that the
// agent should know about before assuming `ok: true` means clean output.
//
// Add new patterns here as the harness gains new failure modes that should
// not be silent. Keep them ANCHORED enough that benign progress lines don't
// match — e.g. `routing shot N to wan-2-7` is informational, not a warning.
const WARNING_PATTERNS: RegExp[] = [
  /^\s*(?:[⚠⚠️!]+|WARN(?:ING)?)\b/i,
  /\bwarning:\s/i,
  /\bsilent rejection\b/i,
  /\bauto-snap(?:ped)?\b/i,
  /\bfall(?:ing)?\s*back\b/i,
  /\bdeprecat(?:ed|ion)\b/i,
  /x-venice-model-deprecation/i,
  /\bretry(?:\s+\d+\s*\/\s*\d+|ing)\b/i,
  /\bpadded audio_url\b/i,
  /\b(?:rate[\s-]?limit|429)\b/i,
  /\b410\s+gone\b/i,
  /\bSeedance\s+R2V\s+keyframe\s+pipeline\s+failed\b/i,
  /\bcompatibility\s+rejection\b/i,
];

export function extractWarnings(stdout: string, stderr: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const scan = (text: string): void => {
    if (!text) return;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (!WARNING_PATTERNS.some((re) => re.test(line))) continue;
      // Collapse exact-duplicate lines but keep distinct retry counts etc.
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
      // Cap to avoid drowning the agent in a runaway harness log.
      if (out.length >= 12) return;
    }
  };
  scan(stderr);
  scan(stdout);
  return out;
}
