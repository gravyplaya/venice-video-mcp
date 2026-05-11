#!/usr/bin/env node
import('../scripts/install-skills.js').catch((err) => {
  process.stderr.write(`[venice-video-mcp install-skills] failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
