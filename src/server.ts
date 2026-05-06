#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  SeriesInput,
  CharacterInput,
  EpisodeInput,
  MediaInput,
  AssembleInput,
  InspectInput,
} from './schemas.js';
import { handleSeries } from './tools/series.js';
import { handleCharacter } from './tools/character.js';
import { handleEpisode } from './tools/episode.js';
import { handleMedia } from './tools/media.js';
import { handleAssemble } from './tools/assemble.js';
import { handleInspect } from './tools/inspect.js';
import { err } from './responses.js';
import type { ProgressCtx } from './progress.js';

const server = new McpServer(
  { name: 'venice-video-mcp', version: '0.1.0' },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  },
);

const SKILL_HINT = 'See skill venice-mcp-pipeline for usage; venice-mcp-cookbook for examples.';

function progressCtx(extra: any): ProgressCtx {
  return {
    progressToken: extra?._meta?.progressToken,
    send: extra?.sendNotification,
    signal: extra?.signal,
  };
}

server.registerTool(
  'series',
  {
    description: `Manage Venice series state (create / list / set or explore aesthetic). ${SKILL_HINT}`,
    inputSchema: SeriesInput,
  },
  async (args: any) => {
    const parsed = SeriesInput.safeParse(args);
    if (!parsed.success) return err('invalid args for series', { stderrTail: formatZodError(parsed.error) });
    return handleSeries(parsed.data);
  },
);

server.registerTool(
  'character',
  {
    description: `Manage characters in a series (add / audition voices / lock voice). ${SKILL_HINT}`,
    inputSchema: CharacterInput,
  },
  async (args: any) => {
    const parsed = CharacterInput.safeParse(args);
    if (!parsed.success) return err('invalid args for character', { stderrTail: formatZodError(parsed.error) });
    return handleCharacter(parsed.data);
  },
);

server.registerTool(
  'episode',
  {
    description: `Episode workflow: new / workshop script / approve / storyboard / qa / qa_approve / fix_panel. ${SKILL_HINT}`,
    inputSchema: EpisodeInput,
  },
  async (args: any) => {
    const parsed = EpisodeInput.safeParse(args);
    if (!parsed.success) return err('invalid args for episode', { stderrTail: formatZodError(parsed.error) });
    return handleEpisode(parsed.data);
  },
);

server.registerTool(
  'media',
  {
    description: `Generate or override media (videos / dialogue / sfx / music) and validate outputs. Long-running; supports progress. ${SKILL_HINT}`,
    inputSchema: MediaInput,
  },
  async (args: any, extra: any) => {
    const parsed = MediaInput.safeParse(args);
    if (!parsed.success) return err('invalid args for media', { stderrTail: formatZodError(parsed.error) });
    return handleMedia(parsed.data, progressCtx(extra));
  },
);

server.registerTool(
  'assemble',
  {
    description: `Final assembly and editing: assemble / produce / edit_transcribe / edit_render / edit_timeline. Long-running; supports progress. ${SKILL_HINT}`,
    inputSchema: AssembleInput,
  },
  async (args: any, extra: any) => {
    const parsed = AssembleInput.safeParse(args);
    if (!parsed.success) return err('invalid args for assemble', { stderrTail: formatZodError(parsed.error) });
    return handleAssemble(parsed.data, progressCtx(extra));
  },
);

server.registerTool(
  'inspect',
  {
    description: `Read-only state inspection (list / series / episode / shot / models / voices). Cheap, no spawn. ${SKILL_HINT}`,
    inputSchema: InspectInput,
  },
  async (args: any) => {
    const parsed = InspectInput.safeParse(args);
    if (!parsed.success) return err('invalid args for inspect', { stderrTail: formatZodError(parsed.error) });
    return handleInspect(parsed.data);
  },
);

function formatZodError(error: any): string {
  if (error?.issues && Array.isArray(error.issues)) {
    return error.issues
      .map((i: any) => `${i.path?.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
  }
  return String(error);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[venice-video-mcp] connected on stdio\n');
}

main().catch((e) => {
  process.stderr.write(`[venice-video-mcp] fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
