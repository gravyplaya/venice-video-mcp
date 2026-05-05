import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolveProjectPath, getWorkspace, getHarnessRoot } from '../config.js';
import { ok, err, type ToolContent } from '../responses.js';
import type { InspectInputT } from '../schemas.js';

export async function handleInspect(input: InspectInputT): Promise<ToolContent> {
  switch (input.action) {
    case 'list': {
      const ws = getWorkspace();
      const candidates = [join(ws, 'output'), ws];
      for (const root of candidates) {
        if (!existsSync(root)) continue;
        const entries = await listSeriesIn(root);
        if (entries.length) {
          return ok(`found ${entries.length} series under ${root}`, {
            data: { workspace: ws, root, series: entries },
          });
        }
      }
      return ok('no series found', { data: { workspace: ws, series: [] } });
    }
    case 'series': {
      const dir = resolveProjectPath(input.project);
      const seriesPath = join(dir, 'series.json');
      if (!existsSync(seriesPath)) {
        return err(`series.json not found at ${seriesPath}`);
      }
      const data = JSON.parse(await readFile(seriesPath, 'utf8'));
      const summary = summarizeSeries(data);
      return ok(`loaded series ${summary.slug ?? '(unknown)'}`, {
        paths: { seriesJson: seriesPath, projectDir: dir },
        data: summary,
      });
    }
    case 'episode': {
      const dir = resolveProjectPath(input.project);
      const epDir = join(dir, 'episodes', `episode-${pad(input.episode)}`);
      if (!existsSync(epDir)) return err(`episode dir not found: ${epDir}`);
      const result: {
        dir: string;
        scriptVersions: string[];
        approved: boolean;
        qaApproved: boolean;
        finalVideo: string | null;
        shotCount: number | null;
      } = {
        dir: epDir,
        scriptVersions: [],
        approved: false,
        qaApproved: false,
        finalVideo: null,
        shotCount: null,
      };
      const files = await readdir(epDir);
      for (const f of files) {
        if (/^script(?:-v\d+)?\.json$/.test(f)) result.scriptVersions.push(f);
        if (f === 'script-approved.json') result.approved = true;
        if (f === 'qa-approved.json') result.qaApproved = true;
        if (/^episode-\d+-final\.mp4$/.test(f)) result.finalVideo = join(epDir, f);
      }
      const scriptPath = join(epDir, 'script.json');
      if (existsSync(scriptPath)) {
        try {
          const script = JSON.parse(await readFile(scriptPath, 'utf8'));
          if (Array.isArray(script.shots)) result.shotCount = script.shots.length;
        } catch {
        }
      }
      return ok(`inspected episode ${input.episode}`, { paths: { episodeDir: epDir }, data: result });
    }
    case 'shot': {
      const dir = resolveProjectPath(input.project);
      const epDir = join(dir, 'episodes', `episode-${pad(input.episode)}`);
      const sceneDir = join(epDir, 'scene-001');
      if (!existsSync(sceneDir)) return err(`scene-001 dir not found at ${sceneDir}`);
      const shotStem = `shot-${pad(input.shot)}`;
      const all = await readdir(sceneDir);
      const matches = all.filter((f) => f.startsWith(shotStem));
      if (matches.length === 0) return err(`no files matching ${shotStem}* in ${sceneDir}`);
      return ok(`found ${matches.length} files for ${shotStem}`, {
        paths: { sceneDir },
        data: { files: matches.sort() },
      });
    }
    case 'models': {
      const harnessDir = getHarnessRoot();
      const summary: Record<string, string[]> = {};
      if (harnessDir) {
        const modelsPath = join(harnessDir, 'src', 'venice', 'models.ts');
        if (existsSync(modelsPath)) {
          const text = await readFile(modelsPath, 'utf8');
          const ids = extractModelIds(text);
          if (input.category === 'all') {
            summary.all = ids;
          } else {
            summary[input.category] = ids.filter((id) => matchCategory(id, input.category));
          }
        }
      }
      return ok('model registry', {
        data: {
          source: harnessDir ? 'harness src/venice/models.ts' : 'unavailable (set HARNESS_PATH)',
          ...summary,
        },
      });
    }
    case 'voices': {
      const harnessDir = getHarnessRoot();
      if (!harnessDir) {
        return ok('voice catalog', { data: { source: 'unavailable (set HARNESS_PATH)' } });
      }
      const voicesPath = join(harnessDir, 'src', 'venice', 'voices.ts');
      if (!existsSync(voicesPath)) {
        return ok('voice catalog', { data: { source: voicesPath, note: 'file not found' } });
      }
      const text = await readFile(voicesPath, 'utf8');
      const voiceIds = extractVoiceIds(text);
      return ok('voice catalog', {
        data: {
          source: voicesPath,
          provider: input.provider,
          count: voiceIds.length,
          ids: voiceIds,
        },
      });
    }
    default: {
      const exhaustive: never = input;
      return err(`unknown inspect action: ${(exhaustive as { action?: string }).action ?? 'unknown'}`);
    }
  }
}

async function listSeriesIn(root: string): Promise<Array<{ slug: string; path: string; episodes: number }>> {
  const out: Array<{ slug: string; path: string; episodes: number }> = [];
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return out;
  }
  for (const name of entries) {
    const dir = join(root, name);
    try {
      const st = await stat(dir);
      if (!st.isDirectory()) continue;
      const seriesJson = join(dir, 'series.json');
      if (!existsSync(seriesJson)) continue;
      const data = JSON.parse(await readFile(seriesJson, 'utf8'));
      out.push({
        slug: data.slug ?? name,
        path: dir,
        episodes: Array.isArray(data.episodes) ? data.episodes.length : 0,
      });
    } catch {
    }
  }
  return out;
}

function summarizeSeries(data: any) {
  return {
    name: data.name,
    slug: data.slug,
    genre: data.genre,
    setting: data.setting,
    aestheticStyle: data.aesthetic?.style,
    characters: Array.isArray(data.characters)
      ? data.characters.map((c: any) => ({
          name: c.name,
          gender: c.gender,
          locked: c.locked === true,
          voiceId: c.voiceId,
        }))
      : [],
    episodes: Array.isArray(data.episodes)
      ? data.episodes.map((e: any) => ({ number: e.number, title: e.title, status: e.status }))
      : [],
    videoDefaults: data.videoDefaults,
  };
}

function extractModelIds(src: string): string[] {
  const ids = new Set<string>();
  const idRe = /['"`]([a-z0-9._-]+)['"`]/g;
  for (const m of src.matchAll(/id:\s*['"`]([^'"`]+)['"`]/g)) ids.add(m[1]);
  return Array.from(ids).sort();
}

function matchCategory(id: string, cat: string): boolean {
  if (cat === 'video') return /(video|kling|veo|sora|wan|ltx|seedance|grok-imagine|pixverse|longcat|hunyuan-video)/i.test(id);
  if (cat === 'image') return /(image|nano-banana|flux|seedream|recraft|qwen-image|chroma|hidream|gpt-image|grok-imagine)/i.test(id) && !/edit/.test(id);
  if (cat === 'edit') return /-edit$/.test(id) || /\bedit\b/.test(id);
  if (cat === 'tts') return /^tts-|^elevenlabs-tts-/.test(id);
  if (cat === 'music') return /(music|ace-step|stable-audio|minimax-music)/i.test(id);
  if (cat === 'sfx') return /(sound-effects|mmaudio)/i.test(id);
  return false;
}

function extractVoiceIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/id:\s*['"`]([^'"`]+)['"`]/g)) ids.add(m[1]);
  return Array.from(ids).sort();
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}
