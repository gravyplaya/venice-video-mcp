import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runHarness } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, ok, err, type ToolContent } from '../responses.js';
import type { LocationInputT } from '../schemas.js';

export async function handleLocation(input: LocationInputT): Promise<ToolContent> {
  try {
    switch (input.action) {
      case 'add': {
        const projectPath = resolveProjectPath(input.project);
        const args = [
          'add-location',
          '-p', projectPath,
          '--name', input.name,
          '--description', input.description,
        ];
        if (input.lighting) args.push('--lighting', input.lighting);
        if (input.model) args.push('--model', input.model);
        if (input.skipImages) args.push('--skip-images');
        const r = await runHarness(args);
        return fromHarness(r, `added location "${input.name}"`);
      }
      case 'generate_references': {
        const args = [
          'generate-location-references',
          '-p', resolveProjectPath(input.project),
          '-l', input.location,
        ];
        if (input.model) args.push('--model', input.model);
        if (input.force) args.push('--force');
        const r = await runHarness(args);
        return fromHarness(r, `generated location references for ${input.location}`);
      }
      case 'list': {
        // Read-only: parse series.json directly (no spawn) for the location list.
        const dir = resolveProjectPath(input.project);
        const seriesPath = join(dir, 'series.json');
        if (!existsSync(seriesPath)) return err(`series.json not found at ${seriesPath}`);
        let data: any;
        try {
          data = JSON.parse(await readFile(seriesPath, 'utf8'));
        } catch (cause) {
          return err(`failed to parse series.json at ${seriesPath}`, {
            stderrTail: cause instanceof Error ? cause.message : String(cause),
          });
        }
        const locations = Array.isArray(data.locations)
          ? data.locations.map((l: any) => ({
              name: l.name,
              slug: l.slug,
              description: l.description,
              lightingNotes: l.lightingNotes ?? null,
              hasRefs: existsSync(join(dir, 'locations', l.slug, 'wide.png')),
            }))
          : [];
        return ok(`found ${locations.length} location(s)`, {
          paths: { seriesJson: seriesPath, projectDir: dir },
          data: { locations },
        });
      }
      default: {
        const exhaustive: never = input;
        return err(`unknown location action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`location command rejected: ${message}`);
  }
}
