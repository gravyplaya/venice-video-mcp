import { runHarness, runHarnessScript } from '../harness.js';
import { resolveProjectPath, resolveWorkspacePath } from '../config.js';
import { fromHarness, err, type ToolContent } from '../responses.js';
import type { AssembleInputT } from '../schemas.js';
import { makeProgressEmitter, type ProgressCtx } from '../progress.js';

export async function handleAssemble(input: AssembleInputT, ctx: ProgressCtx = {}): Promise<ToolContent> {
  try {
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
        const r = await runHarness(args, { onProgress: emitter.onLine, signal: ctx.signal, timeoutMs: 30 * 60 * 1000 });
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
        const r = await runHarness(args, { onProgress: emitter.onLine, signal: ctx.signal, timeoutMs: 45 * 60 * 1000 });
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
        const r = await runHarnessScript('scripts/transcribe-sources.ts', args, {
          onProgress: emitter.onLine,
          signal: ctx.signal,
          timeoutMs: 20 * 60 * 1000,
        });
        if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
        return fromHarness(r, `transcribed sources from ${input.dir}`, {
          paths: { takesPack: resolveCwd(input.out) },
        });
      }
      case 'edit_render': {
        const args = ['--manifest', resolveCwd(input.manifest)];
        if (input.font) args.push('--font', resolveCwd(input.font));
        if (input.skipArchive) args.push('--skip-archive');
        if (input.dryRun) args.push('--dry-run');

        const emitter = makeProgressEmitter(ctx);
        const r = await runHarnessScript('scripts/render-overlay.ts', args, {
          onProgress: emitter.onLine,
          signal: ctx.signal,
          timeoutMs: 20 * 60 * 1000,
        });
        if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
        return fromHarness(r, `rendered overlay from manifest`, {
          paths: { manifest: resolveCwd(input.manifest) },
        });
      }
      case 'mix_audio': {
        const project = resolveProjectPath(input.project);
        const episodeDir = `${project}/episodes/episode-${pad(input.episode)}`;
        const emitter = makeProgressEmitter(ctx);
        const r = await runHarnessScript('scripts/mix-episode-audio.ts', [episodeDir], {
          onProgress: emitter.onLine,
          signal: ctx.signal,
          timeoutMs: 45 * 60 * 1000,
        });
        if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
        return fromHarness(r, `mixed audio + reassembled episode ${input.episode}`, {
          paths: {
            finalVideo: `${episodeDir}/episode-${pad(input.episode)}-final.mp4`,
            preSubtitleVideo: `${episodeDir}/episode-${pad(input.episode)}-final-nosubs.mp4`,
          },
        });
      }
      case 'export_timeline': {
        const project = resolveProjectPath(input.project);
        const args = [
          'export-timeline',
          '-p', project,
          '-e', String(input.episode),
          '--format', input.format,
          '--fps', String(input.fps),
          '--width', String(input.width),
          '--height', String(input.height),
        ];
        const r = await runHarness(args);
        const ext = exportTimelineExt(input.format);
        return fromHarness(r, `exported ${input.format} timeline for episode ${input.episode}`, {
          paths: {
            timeline: `${project}/episodes/episode-${pad(input.episode)}/episode-${pad(input.episode)}${ext}`,
          },
        });
      }
      case 'edit_timeline': {
        if (input.end <= input.start) {
          return err('assemble command rejected: end must be greater than start');
        }
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

        const r = await runHarnessScript('scripts/timeline-view.ts', args, {
          signal: ctx.signal,
          timeoutMs: 10 * 60 * 1000,
        });
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
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`assemble command rejected: ${message}`);
  }
}

function resolveCwd(p: string): string {
  return resolveWorkspacePath(p);
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}

function exportTimelineExt(format: 'fcpxml' | 'premiere' | 'davinci'): string {
  switch (format) {
    case 'fcpxml': return '.fcpxml';
    case 'premiere': return '.premiere.xml';
    case 'davinci': return '.resolve.fcpxml';
  }
}
