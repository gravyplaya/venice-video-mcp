import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHarnessRoot } from './config.js';

export interface ComponentStatus {
  name: 'venice-video-mcp' | 'venice-video-harness';
  current: string | null;
  latest: string | null;
  behind: boolean;
  releaseUrl: string | null;
  error?: string;
}

export interface UpdateCheckResult {
  schema: 1;
  checkedAt: string;
  ttlMs: number;
  components: ComponentStatus[];
}

export interface UpdateNotice {
  hasUpdates: boolean;
  components: ComponentStatus[];
  checkedAt: string;
}

const CACHE_DIR = join(homedir(), '.venice-video-mcp');
const CACHE_FILE = join(CACHE_DIR, 'update-check.json');
const TTL_OK_MS = 24 * 60 * 60 * 1000;
const TTL_FAIL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

const REPOS = {
  'venice-video-mcp': 'jordanurbs/venice-video-mcp',
  'venice-video-harness': 'jordanurbs/venice-video-harness',
} as const;

export function isUpdateCheckDisabled(): boolean {
  const flag = process.env.VENICE_MCP_UPDATE_CHECK?.trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') return true;
  return false;
}

export function loadCachedNotice(): UpdateNotice | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UpdateCheckResult;
    if (parsed.schema !== 1 || !parsed.checkedAt || !Array.isArray(parsed.components)) return null;
    const ageMs = Date.now() - new Date(parsed.checkedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > parsed.ttlMs) return null;
    return {
      hasUpdates: parsed.components.some((c) => c.behind),
      components: parsed.components,
      checkedAt: parsed.checkedAt,
    };
  } catch {
    return null;
  }
}

export async function runUpdateCheck(): Promise<UpdateNotice | null> {
  if (isUpdateCheckDisabled()) return null;
  const components: ComponentStatus[] = [];
  let anyFetchFailed = false;

  const mcpCurrent = readMcpVersion();
  const mcpStatus = await checkComponent('venice-video-mcp', mcpCurrent);
  components.push(mcpStatus);
  if (mcpStatus.error) anyFetchFailed = true;

  const harnessCurrent = readHarnessVersion();
  if (harnessCurrent !== null) {
    const harnessStatus = await checkComponent('venice-video-harness', harnessCurrent);
    components.push(harnessStatus);
    if (harnessStatus.error) anyFetchFailed = true;
  }

  const result: UpdateCheckResult = {
    schema: 1,
    checkedAt: new Date().toISOString(),
    ttlMs: anyFetchFailed ? TTL_FAIL_MS : TTL_OK_MS,
    components,
  };
  writeCache(result);

  return {
    hasUpdates: components.some((c) => c.behind),
    components,
    checkedAt: result.checkedAt,
  };
}

export function formatNoticeOneLine(notice: UpdateNotice): string {
  const behind = notice.components.filter((c) => c.behind);
  if (behind.length === 0) return '';
  const parts = behind.map(
    (c) => `${c.name} ${c.current ?? '?'} \u2192 ${c.latest ?? '?'}`,
  );
  return `Update available: ${parts.join(', ')}. Run \`venice-video-mcp-update\` (or see README).`;
}

export function formatNoticeForInstructions(notice: UpdateNotice): string {
  const behind = notice.components.filter((c) => c.behind);
  if (behind.length === 0) return '';
  const lines: string[] = [];
  lines.push('UPDATE AVAILABLE:');
  for (const c of behind) {
    const url = c.releaseUrl ? ` (${c.releaseUrl})` : '';
    lines.push(`  - ${c.name}: ${c.current ?? '?'} -> ${c.latest ?? '?'}${url}`);
  }
  lines.push(
    'New Venice models and consistency techniques may be missing from your install. Run `venice-video-mcp-update` to pull, build, and rebuild both repos. Disable this check with VENICE_MCP_UPDATE_CHECK=0.',
  );
  return lines.join('\n');
}

async function checkComponent(
  name: keyof typeof REPOS,
  current: string | null,
): Promise<ComponentStatus> {
  const slug = REPOS[name];
  try {
    const release = await fetchLatestRelease(slug);
    if (!release) {
      return {
        name,
        current,
        latest: null,
        behind: false,
        releaseUrl: null,
      };
    }
    const latest = stripLeadingV(release.tag_name);
    const behind = current !== null && compareSemver(current, latest) < 0;
    return {
      name,
      current,
      latest,
      behind,
      releaseUrl: release.html_url ?? `https://github.com/${slug}/releases/tag/${release.tag_name}`,
    };
  } catch (cause) {
    return {
      name,
      current,
      latest: null,
      behind: false,
      releaseUrl: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

interface GhRelease {
  tag_name: string;
  html_url?: string;
  name?: string;
}

async function fetchLatestRelease(slug: string): Promise<GhRelease | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'venice-video-mcp-update-check',
    };
    if (process.env.GITHUB_TOKEN) {
      headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers,
      signal: controller.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} for ${slug}`);
    }
    const body = (await res.json()) as GhRelease;
    if (!body || typeof body.tag_name !== 'string') return null;
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function readMcpVersion(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '..', 'package.json'),
      resolve(here, '..', '..', 'package.json'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const json = JSON.parse(readFileSync(p, 'utf8'));
        if (json.name === 'venice-video-mcp' && typeof json.version === 'string') {
          return json.version;
        }
      }
    }
  } catch {
  }
  return null;
}

function readHarnessVersion(): string | null {
  const root = getHarnessRoot();
  if (!root) return null;
  try {
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const json = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

function writeCache(result: UpdateCheckResult): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2), 'utf8');
  } catch {
  }
}

function stripLeadingV(tag: string): string {
  return tag.replace(/^v/i, '').trim();
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function parseSemver(v: string): [number, number, number] {
  const core = v.split(/[-+]/, 1)[0];
  const parts = core.split('.').map((s) => parseInt(s, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}
