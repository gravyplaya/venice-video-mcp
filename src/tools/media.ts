import { runHarness, runHarnessScript } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, err, type ToolContent } from '../responses.js';
import type { MediaInputT } from '../schemas.js';
import { makeProgressEmitter, type ProgressCtx } from '../progress.js';

export async function handleMedia(input: MediaInputT, ctx: ProgressCtx = {}): Promise<ToolContent> {
  try {
    const project = resolveProjectPath(input.project);
    const epArgs = ['-e', String(input.episode)];

    switch (input.action) {
      case 'generate_videos': {
        const args = ['generate-videos', '-p', project, ...epArgs];
        if (input.skipQa) args.push('--skip-qa');
        const emitter = makeProgressEmitter(ctx);
        const r = await runHarness(args, { onProgress: emitter.onLine, signal: ctx.signal, timeoutMs: 45 * 60 * 1000 });
        return fromHarness(r, `generated videos for episode ${input.episode}`, {
          paths: {
            shotsDir: `${project}/episodes/episode-${pad(input.episode)}/scene-001`,
          },
        });
      }
      case 'override_audio': {
        const args = ['override-audio', '-p', project, ...epArgs];
        if (input.dialogue) args.push('--dialogue');
        if (input.sfx) args.push('--sfx');
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 20 * 60 * 1000 });
        return fromHarness(r, `audio overrides applied for episode ${input.episode}`);
      }
      case 'generate_music': {
        const args = ['generate-music', '-p', project, ...epArgs, '--duration', input.duration];
        if (input.prompt) args.push('--prompt', input.prompt);
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 15 * 60 * 1000 });
        return fromHarness(r, `music generated for episode ${input.episode}`, {
          paths: {
            musicPath: `${project}/episodes/episode-${pad(input.episode)}/audio/music.mp3`,
          },
        });
      }
      case 'validate': {
        const cmd = input.videoOutputs ? 'validate-video-outputs' : 'validate-episode';
        const args = [cmd, '-p', project, ...epArgs];
        const r = await runHarness(args, { signal: ctx.signal, timeoutMs: 10 * 60 * 1000 });
        return fromHarness(r, `validated episode ${input.episode}`, { data: { tool: cmd } });
      }
      case 'generate_ambient': {
        const episodeDir = `${project}/episodes/episode-${pad(input.episode)}`;
        const audioDir = `${episodeDir}/audio`;
        const outputPath = `${audioDir}/ambient-${input.layer}.mp3`;
        const emitter = makeProgressEmitter(ctx);
        const r = await runHarnessScript(
          'scripts/generate-ambient-bed.ts',
          [input.prompt, outputPath, String(input.duration)],
          {
            onProgress: emitter.onLine,
            signal: ctx.signal,
            timeoutMs: 15 * 60 * 1000,
          },
        );
        if (!r) return err('cannot locate harness root; set HARNESS_PATH or HARNESS_BIN');
        return fromHarness(r, `generated ambient bed "${input.layer}" for episode ${input.episode}`, {
          paths: { ambientPath: outputPath, audioDir },
          data: { layer: input.layer, durationSec: input.duration },
        });
      }
      default: {
        const exhaustive: never = input;
        return err(`unknown media action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`media command rejected: ${message}`);
  }
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
