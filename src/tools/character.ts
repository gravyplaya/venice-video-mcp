import { runHarness } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, err, type ToolContent } from '../responses.js';
import type { CharacterInputT } from '../schemas.js';

export async function handleCharacter(input: CharacterInputT): Promise<ToolContent> {
  try {
    switch (input.action) {
      case 'add': {
        const projectPath = resolveProjectPath(input.project);
        const args = [
          'add-character',
          '-p', projectPath,
          '--name', input.name,
          '--gender', input.gender,
          '--age', input.age,
        ];
        if (input.description) args.push('--description', input.description);
        args.push('--wardrobe', input.wardrobe);
        if (input.voiceDesc) args.push('--voice-desc', input.voiceDesc);
        if (input.baseTraits) args.push('--base-traits', input.baseTraits);
        if (input.skipImages) args.push('--skip-images');

        const r = await runHarness(args);
        return fromHarness(r, `added character "${input.name}"`, {
          paths: {
            characterDir: `${projectPath}/characters/${input.name.toLowerCase()}`,
          },
        });
      }
      case 'audition_voices': {
        const args = [
          'audition-voices',
          '-p', resolveProjectPath(input.project),
          '-c', input.character,
          '--count', String(input.count),
        ];
        if (input.sampleText) args.push('--sample-text', input.sampleText);
        const r = await runHarness(args);
        return fromHarness(r, `auditioned ${input.count} voices for ${input.character}`);
      }
      case 'lock': {
        const args = [
          'lock-character',
          '-p', resolveProjectPath(input.project),
          '-c', input.character,
          '--voice-id', input.voiceId,
        ];
        if (input.voiceName) args.push('--voice-name', input.voiceName);
        if (input.voiceReference) args.push('--voice-reference', input.voiceReference);
        const r = await runHarness(args);
        return fromHarness(r, `locked voice for ${input.character}`);
      }
      case 'generate_voice_reference': {
        const args = [
          'generate-voice-reference',
          '-p', resolveProjectPath(input.project),
          '-c', input.character,
        ];
        if (input.text) args.push('--text', input.text);
        if (input.voice) args.push('--voice', input.voice);
        if (input.speed !== undefined) args.push('--speed', String(input.speed));
        if (input.file) args.push('--file', input.file);
        if (input.model) args.push('--model', input.model);
        const r = await runHarness(args);
        return fromHarness(r, `generated voice reference for ${input.character}`);
      }
      default: {
        const exhaustive: never = input;
        return err(`unknown character action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`character command rejected: ${message}`);
  }
}
