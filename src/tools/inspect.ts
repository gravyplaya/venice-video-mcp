import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolveProjectPath, getWorkspace, getHarnessRoot } from '../config.js';
import { ok, err, type ToolContent } from '../responses.js';
import type { InspectInputT } from '../schemas.js';

export async function handleInspect(input: InspectInputT): Promise<ToolContent> {
  try {
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
        let data: unknown;
        try {
          data = JSON.parse(await readFile(seriesPath, 'utf8'));
        } catch (cause) {
          return err(`failed to parse series.json at ${seriesPath}`, {
            stderrTail: cause instanceof Error ? cause.message : String(cause),
          });
        }
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
          timelineExports: string[];
          shotCount: number | null;
          musicCueCount: number | null;
          audioMix: boolean;
          status: string | null;
          ambientLayers: string[];
          hasMusic: boolean;
        } = {
          dir: epDir,
          scriptVersions: [],
          approved: false,
          qaApproved: false,
          finalVideo: null,
          timelineExports: [],
          shotCount: null,
          musicCueCount: null,
          audioMix: false,
          status: null,
          ambientLayers: [],
          hasMusic: false,
        };
        const files = await readdir(epDir);
        for (const f of files) {
          if (/^script(?:-v\d+)?\.json$/.test(f)) result.scriptVersions.push(f);
          if (f === 'script-approved.json') result.approved = true;
          if (f === 'qa-approved.json') result.qaApproved = true;
          if (/^episode-\d+-final\.mp4$/.test(f)) result.finalVideo = join(epDir, f);
          if (/^episode-\d+(?:\.premiere\.xml|\.resolve\.fcpxml|\.fcpxml)$/.test(f)) {
            result.timelineExports.push(f);
          }
        }
        const audioDir = join(epDir, 'audio');
        if (existsSync(audioDir)) {
          try {
            const audioFiles = await readdir(audioDir);
            for (const f of audioFiles) {
              const ambient = f.match(/^ambient-(.+)\.mp3$/);
              if (ambient) result.ambientLayers.push(ambient[1]);
              if (f === 'music.mp3') result.hasMusic = true;
            }
            result.ambientLayers.sort();
          } catch {
          }
        }
        const scriptPath = join(epDir, 'script.json');
        if (existsSync(scriptPath)) {
          try {
            const script = JSON.parse(await readFile(scriptPath, 'utf8'));
            if (Array.isArray(script.shots)) result.shotCount = script.shots.length;
            if (Array.isArray(script.musicCues)) result.musicCueCount = script.musicCues.length;
            if (script.audioMix && typeof script.audioMix === 'object') result.audioMix = true;
            if (typeof script.status === 'string') result.status = script.status;
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
        if (input.live || input.category === 'vision') {
          if (!input.live && input.category === 'vision') {
            return err(
              '`vision` category requires `live: true` — vision-capable LLMs are not part of the harness video-model registry. Call inspect.models with { category: "vision", live: true }.',
            );
          }
          return await fetchLiveModelRegistry(input.category);
        }
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
            hint: 'pass { live: true } to query Venice\'s /api/v1/models registry (required for category: "vision")',
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
        const voiceIds = extractVoiceIdsForProvider(text, input.provider);
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
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`inspect command rejected: ${message}`);
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
    storyboardAspectRatio: data.storyboardAspectRatio ?? null,
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
    videoDefaults: summarizeVideoDefaults(data.videoDefaults),
  };
}

function summarizeVideoDefaults(vd: any) {
  if (!vd || typeof vd !== 'object') return vd ?? null;
  return {
    actionModel: vd.actionModel ?? null,
    atmosphereModel: vd.atmosphereModel ?? null,
    characterConsistencyModel: vd.characterConsistencyModel ?? null,
    lipSyncModel: vd.lipSyncModel ?? null,
    seedanceCompatibility: vd.seedanceCompatibility ?? null,
    imageDefaults: vd.imageDefaults ?? null,
    seedanceKeyframeForWan:
      typeof vd.seedanceKeyframeForWan === 'boolean' ? vd.seedanceKeyframeForWan : null,
  };
}

export function extractModelIds(src: string): string[] {
  const ids = new Set<string>();
  // Object-form entries: `{ id: '...', name: ..., type: ... }` used by
  // VIDEO_MODELS / IMAGE_GENERATION_MODELS / MUSIC_MODELS in the harness.
  for (const m of src.matchAll(/id:\s*['"`]([^'"`]+)['"`]/g)) ids.add(m[1]);
  // Bare-string array entries used by `MULTI_EDIT_MODELS` and `TTS_MODELS`.
  // The harness keeps these as `as const` string tuples, so they don't have
  // an `id:` prefix and would otherwise be invisible to inspect.models.
  for (const block of extractNamedArrayBlocks(src, ['MULTI_EDIT_MODELS', 'TTS_MODELS'])) {
    for (const m of block.matchAll(/['"`]([a-z0-9._-]+)['"`]/g)) ids.add(m[1]);
  }
  return Array.from(ids).sort();
}

function extractNamedArrayBlocks(src: string, names: string[]): string[] {
  const blocks: string[] = [];
  for (const name of names) {
    const re = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
    const m = src.match(re);
    if (m) blocks.push(m[1]);
  }
  return blocks;
}

export function matchCategory(id: string, cat: string): boolean {
  if (cat === 'video') return /(video|kling|veo|sora|wan|ltx|seedance|grok-imagine|pixverse|longcat|hunyuan-video|happyhorse|ovi-)/i.test(id);
  if (cat === 'image') {
    if (/edit/.test(id)) return false;
    return /(image|nano-banana|flux|seedream|recraft|qwen-image|chroma|hidream|gpt-image|grok-imagine|lustify|wai-|bria-|imagineart|z-image)/i.test(id);
  }
  if (cat === 'edit') return /-edit$/.test(id) || /\bedit\b/.test(id);
  if (cat === 'tts') return /^tts-|^elevenlabs-tts-/.test(id);
  if (cat === 'music') return /(music|ace-step|stable-audio|minimax-music)/i.test(id);
  if (cat === 'sfx') return /(sound-effects|mmaudio)/i.test(id);
  // `vision` is only meaningful for the live registry (capabilities.supportsVision)
  // since the harness's offline file doesn't carry capability flags. It always
  // fails here so callers fall through to the live-mode path in handleInspect.
  return false;
}

export function extractVoiceIds(src: string): string[] {
  const ids = new Set<string>();
  for (const id of extractQwen3VoiceIds(src)) ids.add(id);
  for (const id of extractKokoroVoiceIds(src)) ids.add(id);
  return Array.from(ids).sort();
}

export function extractVoiceIdsForProvider(src: string, provider: 'kokoro' | 'qwen3' | 'all'): string[] {
  if (provider === 'kokoro') return extractKokoroVoiceIds(src);
  if (provider === 'qwen3') return extractQwen3VoiceIds(src);
  return extractVoiceIds(src);
}

function extractQwen3VoiceIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/\b(?:voice_id|id):\s*['"`]([^'"`]+)['"`]/g)) ids.add(m[1]);
  return Array.from(ids).sort();
}

function extractKokoroVoiceIds(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/buildVoiceGroup\([^)]*?\[([^\]]+)\]\s*\)/g)) {
    for (const id of m[1].matchAll(/['"`]([a-z][a-z0-9_]+)['"`]/g)) ids.add(id[1]);
  }
  return Array.from(ids).sort();
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}

const VENICE_MODELS_URL = 'https://api.venice.ai/api/v1/models?type=text';
const VENICE_FETCH_TIMEOUT_MS = 8000;

export interface LiveModel {
  id: string;
  name?: string;
  traits: string[];
  supportsVision: boolean;
  deprecationDate: string | null;
  pricing: { inputUsd: number | null; outputUsd: number | null };
}

export interface LiveModelRegistry {
  source: string;
  fetchedAt: string;
  count: number;
  category: string;
  models: LiveModel[];
  deprecated: Array<{ id: string; replacement: string | null; date: string }>;
  recommended: { defaultVision: string | null; mostIntelligent: string | null };
}

async function fetchLiveModelRegistry(category: string): Promise<ToolContent> {
  let payload: unknown;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VENICE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(VENICE_MODELS_URL, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return err(`Venice /api/v1/models returned HTTP ${res.status}`, {
        stderrTail: `GET ${VENICE_MODELS_URL} -> ${res.status} ${res.statusText}`,
      });
    }
    payload = await res.json();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`failed to fetch Venice /api/v1/models: ${message}`, {
      stderrTail: `GET ${VENICE_MODELS_URL}`,
    });
  }

  const parsed = parseLiveModels(payload);
  const filtered = filterLiveModels(parsed, category);
  const registry: LiveModelRegistry = {
    source: VENICE_MODELS_URL,
    fetchedAt: new Date().toISOString(),
    count: filtered.length,
    category,
    models: filtered,
    deprecated: parsed
      .filter((m) => m.deprecationDate)
      .map((m) => ({ id: m.id, replacement: null, date: m.deprecationDate as string })),
    recommended: {
      defaultVision: parsed.find((m) => m.traits.includes('default_vision'))?.id ?? null,
      mostIntelligent: parsed.find((m) => m.traits.includes('most_intelligent'))?.id ?? null,
    },
  };
  const note = registry.deprecated.length
    ? `live model registry (${registry.count} match, ${registry.deprecated.length} pending deprecation)`
    : `live model registry (${registry.count} match)`;
  return ok(note, { data: registry as unknown as Record<string, unknown> });
}

export function parseLiveModels(payload: unknown): LiveModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: LiveModel[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as {
      id?: unknown;
      model_spec?: {
        name?: unknown;
        traits?: unknown;
        capabilities?: { supportsVision?: unknown };
        deprecation?: { date?: unknown };
        pricing?: { input?: { usd?: unknown }; output?: { usd?: unknown } };
      };
    };
    if (typeof e.id !== 'string') continue;
    const traits = Array.isArray(e.model_spec?.traits)
      ? (e.model_spec!.traits as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const supportsVision = e.model_spec?.capabilities?.supportsVision === true;
    const deprecationDate =
      typeof e.model_spec?.deprecation?.date === 'string'
        ? (e.model_spec!.deprecation!.date as string)
        : null;
    const pricing = e.model_spec?.pricing;
    out.push({
      id: e.id,
      name: typeof e.model_spec?.name === 'string' ? (e.model_spec!.name as string) : undefined,
      traits,
      supportsVision,
      deprecationDate,
      pricing: {
        inputUsd: typeof pricing?.input?.usd === 'number' ? (pricing.input.usd as number) : null,
        outputUsd: typeof pricing?.output?.usd === 'number' ? (pricing.output.usd as number) : null,
      },
    });
  }
  return out;
}

export function filterLiveModels(models: LiveModel[], category: string): LiveModel[] {
  if (category === 'all') return models;
  if (category === 'vision') return models.filter((m) => m.supportsVision);
  return models.filter((m) => matchCategory(m.id, category));
}
