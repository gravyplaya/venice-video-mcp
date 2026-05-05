import { runHarness } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, err, type ToolContent } from '../responses.js';
import type { MediaInputT } from '../schemas.js';
import { makeProgressEmitter, type ProgressCtx } from '../progress.js';

export async function handleMedia(input: MediaInputT, ctx: ProgressCtx = {}): Promise<ToolContent> {
  const project = resolveProjectPath(input.project);
  const epArgs = ['-e', String(input.episode)];

  switch (input.action) {
    case 'generate_videos': {
      const args = ['generate-videos', '-p', project, ...epArgs];
      if (input.skipQa) args.push('--skip-qa');
      const emitter = makeProgressEmitter(ctx);
      const r = await runHarness(args, { onProgress: emitter.onLine });
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
      const r = await runHarness(args);
      return fromHarness(r, `audio overrides applied for episode ${input.episode}`);
    }
    case 'generate_music': {
      const args = ['generate-music', '-p', project, ...epArgs, '--duration', input.duration];
      if (input.prompt) args.push('--prompt', input.prompt);
      const r = await runHarness(args);
      return fromHarness(r, `music generated for episode ${input.episode}`, {
        paths: {
          musicPath: `${project}/episodes/episode-${pad(input.episode)}/audio/music.mp3`,
        },
      });
    }
    case 'validate': {
      const cmd = input.videoOutputs ? 'validate-video-outputs' : 'validate-episode';
      const args = [cmd, '-p', project, ...epArgs];
      const r = await runHarness(args);
      return fromHarness(r, `validated episode ${input.episode}`, { data: { tool: cmd } });
    }
    default: {
      const exhaustive: never = input;
      return err(`unknown media action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
    }
  }
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
