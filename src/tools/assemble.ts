import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { runHarness, harnessRoot } from '../harness.js';
import { resolveProjectPath, getWorkspace, getVeniceApiKey } from '../config.js';
import { fromHarness, ok, err, type ToolContent } from '../responses.js';
import type { AssembleInputT } from '../schemas.js';
import { makeProgressEmitter, type ProgressCtx } from '../progress.js';

export async function handleAssemble(input: AssembleInputT, ctx: ProgressCtx = {}): Promise<ToolContent> {
  switch (input.action) {
    case 'assemble': {
      const project = resolveProjectPath(input.project);
      const args = ['assemble-episode', '-p', project, '-e', String(input.episode)];
      if (!input.subtitles) args.push('--no-subtitles');
      if (!input.music) args.push('--no-music');
      if (!input.ambient) args.push('--no-ambient');
      args.push('--ambient-volume', String(input.ambientVolume));
      if (!input.dialogueReplace) args.push('--no-dialogue-replace');
      args.push('--native-volume', String(input.nativeVolume));

      const emitter = makeProgressEmitter(ctx);
      const r = await runHarness(args, { onProgress: emitter.onLine });
      return fromHarness(r, `assembled episode ${input.episode}`, {
        paths: {
          finalVideo: `${project}/episodes/episode-${pad(input.episode)}/episode-${pad(input.episode)}-final.mp4`,
        },
      });
    }
    case 'produce': {
      const project = resolveProjectPath(input.project);
      const args = ['produce-episode', '-p', project, '-e', String(input.episode)];
      if (input.withTts) args.push('--with-tts');
      if (input.skipMusic) args.push('--skip-music');
      const emitter = makeProgressEmitter(ctx);
      const r = await runHarness(args, { onProgress: emitter.onLine });
      return fromHarness(r, `produced episode ${input.episode}`, {
        paths: {
          finalVideo: `${project}/episodes/episode-${pad(input.episode)}/episode-${pad(input.episode)}-final.mp4`,
        },
      });
    }
    case 'edit_transcribe': {
      const args = [
        '--dir', resolveCwd(input.dir),
        '--out', resolveCwd(input.out),
        '--model', input.model,
        '--language', input.language,
      ];
      if (input.include) args.push('--include', input.include);
      if (input.alignedFrom) args.push('--aligned-from', resolveCwd(input.alignedFrom));
      if (input.speakerMap) args.push('--speaker-map', resolveCwd(input.speakerMap));
      if (input.wordsOutDir) args.push('--words-out-dir', resolveCwd(input.wordsOutDir));
      if (input.label) args.push('--label', input.label);

      const emitter = makeProgressEmitter(ctx);
      const r = await runHarnessScript('scripts/transcribe-sources.ts', args, emitter.onLine);
      if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
      return fromHarness(r, `transcribed sources from ${input.dir}`, {
        paths: { takesPack: resolveCwd(input.out) },
      });
    }
    case 'edit_render': {
      const args = ['--manifest', resolveCwd(input.manifest)];
      if (input.font) args.push('--font', input.font);
      if (input.skipArchive) args.push('--skip-archive');
      if (input.dryRun) args.push('--dry-run');

      const emitter = makeProgressEmitter(ctx);
      const r = await runHarnessScript('scripts/render-overlay.ts', args, emitter.onLine);
      if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
      return fromHarness(r, `rendered overlay from manifest`, {
        paths: { manifest: resolveCwd(input.manifest) },
      });
    }
    case 'edit_timeline': {
      const args = [
        '--video', resolveCwd(input.video),
        '--start', String(input.start),
        '--end', String(input.end),
        '--out', resolveCwd(input.out),
        '--width', String(input.width),
        '--frames', String(input.frames),
        '--silence-db', String(input.silenceDb),
        '--silence-min', String(input.silenceMin),
      ];
      if (input.wordsJson) args.push('--words', resolveCwd(input.wordsJson));

      const r = await runHarnessScript('scripts/timeline-view.ts', args);
      if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
      return fromHarness(r, `timeline view rendered`, {
        paths: { png: resolveCwd(input.out) },
      });
    }
    default: {
      const exhaustive: never = input;
      return err(`unknown assemble action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
    }
  }
}

async function runHarnessScript(
  rel: string,
  args: string[],
  onProgress?: (line: string, stream: 'stdout' | 'stderr') => void,
) {
  const root = harnessRoot();
  if (!root) return null;
  const scriptPath = join(root, rel);
  if (!existsSync(scriptPath)) return null;

  const tsxBin = resolveTsx(root);
  if (!tsxBin) return null;

  const start = Date.now();
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v;
  }
  const apiKey = getVeniceApiKey();
  if (apiKey && !env.VENICE_API_KEY) env.VENICE_API_KEY = apiKey;

  return new Promise<{
    ok: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    command: string;
    durationMs: number;
  }>((resolvePromise, reject) => {
    const child = spawn(tsxBin, [scriptPath, ...args], {
      cwd: root,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutChunks.push(chunk);
      stdoutBuf += chunk;
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      if (onProgress) for (const l of lines) onProgress(l, 'stdout');
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrChunks.push(chunk);
      stderrBuf += chunk;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      if (onProgress) for (const l of lines) onProgress(l, 'stderr');
    });
    child.on('error', reject);
    child.on('close', (code, sig) => {
      if (onProgress && stdoutBuf) onProgress(stdoutBuf, 'stdout');
      if (onProgress && stderrBuf) onProgress(stderrBuf, 'stderr');
      resolvePromise({
        ok: code === 0,
        code,
        signal: sig,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
        command: `${tsxBin} ${scriptPath} ${args.join(' ')}`,
        durationMs: Date.now() - start,
      });
    });
  });
}

function resolveTsx(harnessDir: string): string | null {
  const local = join(harnessDir, 'node_modules', '.bin', 'tsx');
  if (existsSync(local)) return local;
  return null;
}

function resolveCwd(p: string): string {
  if (isAbsolute(p)) return p;
  return resolve(getWorkspace(), p);
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
