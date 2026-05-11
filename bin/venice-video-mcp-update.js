#!/usr/bin/env node
import('../scripts/update.js').catch((err) => {
  process.stderr.write(`[venice-video-mcp-update] failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
