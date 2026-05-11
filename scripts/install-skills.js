import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { mkdir, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    if (i === -1) return null;
    return argv[i + 1] ?? null;
  };
  const has = (flag) => argv.includes(flag);
  return {
    workspace: get('--workspace') ?? get('-w'),
    global: has('--global') || has('-g'),
    uninstall: has('--uninstall'),
    dryRun: has('--dry-run'),
    help: has('--help') || has('-h'),
  };
}

function help() {
  console.log(`Usage: venice-video-mcp install-skills [options]

Symlinks the venice-video-mcp companion skills into a target .claude/skills/ directory.

Options:
  -w, --workspace <dir>    Target workspace dir; symlinks land in <dir>/.claude/skills/
  -g, --global             Target ~/.claude/skills/ (available in any project)
      --uninstall          Remove the symlinks (does not delete the source skills)
      --dry-run            Print what would happen without doing it
  -h, --help               Show this help

Either --workspace or --global is required. Pass both to install in two places.

Examples:
  venice-video-mcp install-skills --workspace ./
  venice-video-mcp install-skills --global
  venice-video-mcp install-skills --workspace ./ --global
  venice-video-mcp install-skills --workspace ./ --uninstall
`);
}

async function ensureDir(dir, dryRun) {
  if (existsSync(dir)) return;
  if (dryRun) {
    console.log(`would mkdir -p ${dir}`);
    return;
  }
  await mkdir(dir, { recursive: true });
}

async function linkSkill(source, targetParent, skillName, uninstall, dryRun) {
  const target = join(targetParent, skillName);
  const exists = existsSync(target) || lstatSafe(target) !== null;

  if (uninstall) {
    if (!exists) {
      console.log(`(skip) not present: ${target}`);
      return;
    }
    const st = lstatSafe(target);
    if (!st || !st.isSymbolicLink()) {
      console.log(`(skip) not a symlink: ${target}`);
      return;
    }
    if (dryRun) {
      console.log(`would rm ${target}`);
      return;
    }
    await unlink(target);
    console.log(`removed ${target}`);
    return;
  }

  if (exists) {
    const st = lstatSafe(target);
    if (st && st.isSymbolicLink()) {
      const current = readlinkSync(target);
      const currentResolved = isAbsolute(current) ? current : resolve(targetParent, current);
      if (currentResolved === source) {
        console.log(`(idempotent) already linked: ${target}`);
        return;
      }
      if (dryRun) {
        console.log(`would replace symlink ${target} -> ${source}`);
        return;
      }
      await unlink(target);
      await symlink(source, target);
      console.log(`replaced symlink ${target} -> ${source}`);
      return;
    }
    console.log(`(skip) ${target} exists and is not a symlink (refusing to overwrite)`);
    return;
  }

  if (dryRun) {
    console.log(`would ln -s ${source} ${target}`);
    return;
  }
  await symlink(source, target);
  console.log(`linked ${target} -> ${source}`);
}

function lstatSafe(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  if (!args.workspace && !args.global) {
    help();
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const skillsRoot = join(repoRoot, 'skills');

  if (!existsSync(skillsRoot)) {
    console.error(`source skills dir not found: ${skillsRoot}`);
    process.exit(1);
  }

  const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => existsSync(join(skillsRoot, n, 'SKILL.md')));

  if (skillNames.length === 0) {
    console.error(`no skills found under ${skillsRoot}`);
    process.exit(1);
  }

  const targets = [];
  if (args.workspace) {
    const ws = isAbsolute(args.workspace) ? args.workspace : resolve(args.workspace);
    targets.push(join(ws, '.claude', 'skills'));
  }
  if (args.global) {
    targets.push(join(homedir(), '.claude', 'skills'));
  }

  for (const target of targets) {
    console.log(`\n== target: ${target} ==`);
    await ensureDir(target, args.dryRun);
    for (const skill of skillNames) {
      const source = join(skillsRoot, skill);
      await linkSkill(source, target, skill, args.uninstall, args.dryRun);
    }
  }

  console.log('\ndone.');
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
