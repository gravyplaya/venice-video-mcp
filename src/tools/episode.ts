import { runHarness } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, err, type ToolContent } from '../responses.js';
import type { EpisodeInputT } from '../schemas.js';

export async function handleEpisode(input: EpisodeInputT): Promise<ToolContent> {
  const project = 'project' in input ? resolveProjectPath(input.project) : '';
  const episodeArgs = (n: number): string[] => ['-e', String(n)];

  switch (input.action) {
    case 'new': {
      const r = await runHarness([
        'new-episode',
        '-p', project,
        '-t', input.title,
      ]);
      return fromHarness(r, `created episode "${input.title}"`);
    }
    case 'workshop': {
      const args = [
        'workshop-episode',
        '-p', project,
        ...episodeArgs(input.episode),
        '--concept', input.concept,
        '--model', input.model,
      ];
      const r = await runHarness(args);
      return fromHarness(r, `workshopped script for episode ${input.episode}`, {
        paths: { script: `${project}/episodes/episode-${pad(input.episode)}/script.json` },
      });
    }
    case 'approve': {
      const args = ['approve-script', '-p', project, ...episodeArgs(input.episode)];
      if (input.notes) args.push('--notes', input.notes);
      const r = await runHarness(args);
      return fromHarness(r, `approved script for episode ${input.episode}`);
    }
    case 'storyboard': {
      const args = [
        'storyboard-episode',
        '-p', project,
        ...episodeArgs(input.episode),
        '--edit-model', input.editModel,
      ];
      if (!input.refine) args.push('--no-refine');
      if (input.cfgScale !== undefined) args.push('--cfg-scale', String(input.cfgScale));
      if (input.debug) args.push('--debug');
      if (input.skipApproval) args.push('--skip-approval');
      if (input.force) args.push('--force');
      const r = await runHarness(args);
      return fromHarness(r, `storyboarded episode ${input.episode}`);
    }
    case 'qa': {
      const args = [
        'qa-storyboard',
        '-p', project,
        ...episodeArgs(input.episode),
        '--model', input.model,
      ];
      if (input.shots) args.push('--shots', input.shots);
      const r = await runHarness(args);
      return fromHarness(r, `ran QA on episode ${input.episode}`);
    }
    case 'qa_approve': {
      const args = ['qa-approve', '-p', project, ...episodeArgs(input.episode)];
      if (input.notes) args.push('--notes', input.notes);
      const r = await runHarness(args);
      return fromHarness(r, `QA approved for episode ${input.episode}`);
    }
    case 'fix_panel': {
      const args = [
        'fix-panel',
        '-p', project,
        ...episodeArgs(input.episode),
        '-s', String(input.shot),
        '--edit-model', input.editModel,
      ];
      if (input.characters) args.push('-c', input.characters);
      if (input.prompt) args.push('--prompt', input.prompt);
      const r = await runHarness(args);
      return fromHarness(r, `fixed panel for shot ${input.shot}`);
    }
    default: {
      const exhaustive: never = input;
      return err(`unknown episode action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
    }
  }
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
