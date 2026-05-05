#!/usr/bin/env node
import('../dist/server.js').catch((err) => {
  process.stderr.write(`[venice-video-mcp] failed to start: ${err?.stack ?? err}\n`);
  process.exit(1);
});
