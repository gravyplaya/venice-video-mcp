import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const has = (flag) => argv.includes(flag);
  return {
    mcpOnly: has('--mcp-only'),
    harnessOnly: has('--harness-only'),
    skipBuild: has('--skip-build'),
    dryRun: has('--dry-run'),
    yes: has('--yes') || has('-y'),
    help: has('--help') || has('-h'),
  };
}

function help() {
  console.log(`Usage: venice-video-mcp-update [options]

Pulls the latest commits in the venice-video-mcp repo and (if HARNESS_PATH is
set) the venice-video-harness repo, then runs npm install + npm run build in
each. Refuses to proceed if either working tree is dirty.

Options:
  --mcp-only        Only update this MCP repo (skip the harness)
  --harness-only    Only update the harness repo (skip this MCP)
  --skip-build      git pull only; skip npm install / npm run build
  --dry-run         Print what would happen without executing
  -y, --yes         Skip the interactive confirmation prompt
  -h, --help        Show this help

Environment:
  HARNESS_PATH      Required to update the harness. Absolute path to the
                    venice-video-harness checkout.

Examples:
  venice-video-mcp-update                  # update both, prompt to confirm
  venice-video-mcp-update --yes            # update both, no prompt
  venice-video-mcp-update --mcp-only -y    # only this repo
  venice-video-mcp-update --dry-run        # see the plan first
`);
}

function findMcpRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '..'), resolve(here, '..', '..')];
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(c, 'package.json'), 'utf8'));
        if (pkg.name === 'venice-video-mcp') return c;
      } catch {
      }
    }
  }
  return resolve(here, '..');
}

function readVersion(repoRoot) {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

function readHead(repoRoot) {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function ensureClean(repoRoot, label) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`[${label}] git status failed in ${repoRoot}`);
    return false;
  }
  if (r.stdout.trim().length > 0) {
    console.error(`[${label}] working tree is dirty in ${repoRoot}; commit or stash first`);
    console.error(r.stdout);
    return false;
  }
  return true;
}

function run(label, cmd, args, cwd, dryRun) {
  const display = `${cmd} ${args.join(' ')}`;
  console.log(`[${label}] $ ${display}   (cwd: ${cwd})`);
  if (dryRun) return true;
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[${label}] ${display} failed (exit ${r.status})`);
    return false;
  }
  return true;
}

async function confirm(prompt) {
  process.stdout.write(`${prompt} [y/N] `);
  return new Promise((resolveP) => {
    const onData = (chunk) => {
      const answer = chunk.toString('utf8').trim().toLowerCase();
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
      resolveP(answer === 'y' || answer === 'yes');
    };
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }
  if (args.mcpOnly && args.harnessOnly) {
    console.error('--mcp-only and --harness-only are mutually exclusive');
    process.exit(2);
  }

  const plans = [];

  if (!args.harnessOnly) {
    const mcpRoot = findMcpRoot();
    if (!ensureClean(mcpRoot, 'mcp')) process.exit(1);
    plans.push({
      label: 'mcp',
      root: mcpRoot,
      before: { version: readVersion(mcpRoot), head: readHead(mcpRoot) },
    });
  }

  if (!args.mcpOnly) {
    const harnessRoot = process.env.HARNESS_PATH?.trim();
    if (!harnessRoot) {
      if (args.harnessOnly) {
        console.error('HARNESS_PATH is not set; cannot update harness');
        process.exit(1);
      }
      console.log('[harness] HARNESS_PATH not set; skipping harness update');
    } else if (!existsSync(harnessRoot)) {
      console.error(`HARNESS_PATH "${harnessRoot}" does not exist`);
      process.exit(1);
    } else {
      if (!ensureClean(harnessRoot, 'harness')) process.exit(1);
      plans.push({
        label: 'harness',
        root: harnessRoot,
        before: { version: readVersion(harnessRoot), head: readHead(harnessRoot) },
      });
    }
  }

  if (plans.length === 0) {
    console.error('Nothing to do.');
    process.exit(1);
  }

  console.log('\nPlan:');
  for (const p of plans) {
    console.log(`  ${p.label}: ${p.root}`);
    console.log(`    current: v${p.before.version ?? '?'} @ ${p.before.head ?? '?'}`);
    console.log(`    will run: git pull --ff-only${args.skipBuild ? '' : ' && npm install && npm run build'}`);
  }
  console.log('');

  if (!args.yes && !args.dryRun) {
    const ok = await confirm('Proceed?');
    if (!ok) {
      console.log('aborted.');
      process.exit(0);
    }
  }

  for (const p of plans) {
    if (!run(p.label, 'git', ['pull', '--ff-only'], p.root, args.dryRun)) process.exit(1);
    if (!args.skipBuild) {
      if (!run(p.label, 'npm', ['install'], p.root, args.dryRun)) process.exit(1);
      if (!run(p.label, 'npm', ['run', 'build'], p.root, args.dryRun)) process.exit(1);
    }
  }

  console.log('\nResult:');
  for (const p of plans) {
    if (args.dryRun) {
      console.log(`  ${p.label}: (dry run, unchanged)`);
      continue;
    }
    const after = { version: readVersion(p.root), head: readHead(p.root) };
    const versionChanged = p.before.version !== after.version;
    const headChanged = p.before.head !== after.head;
    if (versionChanged || headChanged) {
      console.log(
        `  ${p.label}: v${p.before.version ?? '?'} \u2192 v${after.version ?? '?'}  (${p.before.head ?? '?'} \u2192 ${after.head ?? '?'})`,
      );
    } else {
      console.log(`  ${p.label}: already up to date (v${after.version ?? '?'} @ ${after.head ?? '?'})`);
    }
  }

  console.log('\nDone. Restart your MCP client to pick up the new build.');
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
