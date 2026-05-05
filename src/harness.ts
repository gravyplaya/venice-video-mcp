import { spawn } from 'node:child_process';
import { getHarnessConfig, getHarnessRoot, getVeniceApiKey } from './config.js';

export interface HarnessRunOptions {
  onProgress?: (line: string, stream: 'stdout' | 'stderr') => void;
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HarnessResult {
  ok: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  command: string;
  durationMs: number;
}

export async function runHarness(
  args: string[],
  opts: HarnessRunOptions = {},
): Promise<HarnessResult> {
  const cfg = getHarnessConfig();
  const fullArgs = [...cfg.args, ...args];
  const start = Date.now();

  const env: Record<string, string> = {
    ...processEnvAsRecord(),
    ...(opts.env ?? {}),
  };
  const apiKey = getVeniceApiKey();
  if (apiKey && !env.VENICE_API_KEY) env.VENICE_API_KEY = apiKey;

  return new Promise<HarnessResult>((resolvePromise, reject) => {
    const child = spawn(cfg.bin, fullArgs, {
      cwd: opts.cwd ?? cfg.cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBuf = '';
    let stderrBuf = '';
    let timedOut = false;

    const onLine = (line: string, stream: 'stdout' | 'stderr') => {
      if (opts.onProgress) {
        try {
          opts.onProgress(line, stream);
        } catch {
        }
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutChunks.push(chunk);
      stdoutBuf += chunk;
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) onLine(line, 'stdout');
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrChunks.push(chunk);
      stderrBuf += chunk;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) onLine(line, 'stderr');
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      }, opts.timeoutMs);
    }

    if (opts.signal) {
      if (opts.signal.aborted) child.kill('SIGTERM');
      opts.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    }

    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on('close', (code, sig) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (stdoutBuf) onLine(stdoutBuf, 'stdout');
      if (stderrBuf) onLine(stderrBuf, 'stderr');

      const result: HarnessResult = {
        ok: code === 0 && !timedOut,
        code,
        signal: sig,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        command: `${cfg.bin} ${fullArgs.join(' ')}`,
        durationMs: Date.now() - start,
      };
      resolvePromise(result);
    });
  });
}

export function harnessRoot(): string | null {
  return getHarnessRoot();
}

function processEnvAsRecord(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
