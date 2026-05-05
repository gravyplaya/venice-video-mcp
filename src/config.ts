import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import 'dotenv/config';

export interface HarnessConfig {
  bin: string;
  args: string[];
  cwd: string;
}

let cachedConfig: HarnessConfig | null = null;

export function getHarnessConfig(): HarnessConfig {
  if (cachedConfig) return cachedConfig;

  const explicitBin = process.env.HARNESS_BIN?.trim();
  if (explicitBin && existsSync(explicitBin)) {
    cachedConfig = {
      bin: 'node',
      args: [explicitBin],
      cwd: getWorkspace(),
    };
    return cachedConfig;
  }

  const linkedBin = resolveOnPath('venice-video');
  if (linkedBin) {
    cachedConfig = {
      bin: linkedBin,
      args: [],
      cwd: getWorkspace(),
    };
    return cachedConfig;
  }

  const harnessPath = process.env.HARNESS_PATH?.trim();
  if (harnessPath) {
    const distEntry = join(harnessPath, 'dist/mini-drama/cli.js');
    if (existsSync(distEntry)) {
      cachedConfig = {
        bin: 'node',
        args: [distEntry],
        cwd: getWorkspace(),
      };
      return cachedConfig;
    }
    throw new Error(
      `HARNESS_PATH is set to "${harnessPath}" but ${distEntry} does not exist. ` +
        `Run \`npm install && npm run build\` in the harness repo first.`,
    );
  }

  throw new Error(
    [
      'venice-video-harness binary not found. Set one of:',
      '  - HARNESS_BIN=/path/to/dist/mini-drama/cli.js',
      '  - HARNESS_PATH=/path/to/venice-video-harness   (with a built dist/)',
      '  - Run `npm link` inside the harness repo so `venice-video` is on PATH',
    ].join('\n'),
  );
}

export function getWorkspace(): string {
  const ws = process.env.HARNESS_WORKSPACE?.trim();
  if (ws) {
    const abs = isAbsolute(ws) ? ws : resolve(ws);
    if (!existsSync(abs)) {
      throw new Error(`HARNESS_WORKSPACE "${abs}" does not exist`);
    }
    return abs;
  }
  return process.cwd();
}

export function getVeniceApiKey(): string | undefined {
  return process.env.VENICE_API_KEY?.trim() || undefined;
}

export function getHarnessRoot(): string | null {
  const harnessPath = process.env.HARNESS_PATH?.trim();
  if (harnessPath && existsSync(harnessPath)) {
    return harnessPath;
  }
  const explicitBin = process.env.HARNESS_BIN?.trim();
  if (explicitBin && existsSync(explicitBin)) {
    return resolve(explicitBin, '..', '..', '..');
  }
  return null;
}

export function resolveProjectPath(project: string): string {
  if (isAbsolute(project)) return project;

  const ws = getWorkspace();
  const direct = resolve(ws, project);
  if (existsSync(direct) && statSync(direct).isDirectory()) return direct;

  const underOutput = resolve(ws, 'output', project);
  if (existsSync(underOutput) && statSync(underOutput).isDirectory()) return underOutput;

  return direct;
}

function resolveOnPath(cmd: string): string | null {
  try {
    const out = execSync(`command -v ${cmd}`, { encoding: 'utf8' }).trim();
    if (out && existsSync(out)) return out;
  } catch {
  }
  return null;
}
