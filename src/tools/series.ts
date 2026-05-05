import { runHarness } from '../harness.js';
import { resolveProjectPath } from '../config.js';
import { fromHarness, ok, err, type ToolContent } from '../responses.js';
import type { SeriesInputT } from '../schemas.js';

export async function handleSeries(input: SeriesInputT): Promise<ToolContent> {
  switch (input.action) {
    case 'new': {
      const args = [
        'new-series',
        '-n', input.name,
        '--concept', input.concept,
        '-g', input.genre,
        '--setting', input.setting,
      ];
      const r = await runHarness(args);
      if (!r.ok) return fromHarness(r, 'new-series failed');
      const slug = slugify(input.name);
      return fromHarness(r, `created series "${input.name}"`, {
        paths: { project: `output/${slug}`, seriesJson: `output/${slug}/series.json` },
        data: { slug },
      });
    }
    case 'list': {
      const r = await runHarness(['list-series']);
      return fromHarness(r, 'listed series', { data: { stdout: r.stdout.trim() } });
    }
    case 'set_aesthetic': {
      const args = [
        'set-aesthetic',
        '-p', resolveProjectPath(input.project),
        '--style', input.style,
        '--palette', input.palette,
        '--lighting', input.lighting,
        '--lens', input.lens,
        '--film', input.film,
      ];
      const r = await runHarness(args);
      return fromHarness(r, 'aesthetic locked');
    }
    case 'explore_aesthetic': {
      const args = [
        'explore-aesthetic',
        '-p', resolveProjectPath(input.project),
        '--count', String(input.count),
      ];
      const r = await runHarness(args);
      return fromHarness(r, 'aesthetic samples generated', {
        paths: { samplesDir: `${resolveProjectPath(input.project)}/aesthetic-samples` },
      });
    }
    default: {
      const exhaustive: never = input;
      return err(`unknown series action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
    }
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
