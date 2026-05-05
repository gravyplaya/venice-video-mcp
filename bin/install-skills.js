#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const tsxBin = resolve(repoRoot, 'node_modules', '.bin', 'tsx');
const script = resolve(repoRoot, 'scripts', 'install-skills.ts');
const args = process.argv.slice(2);

const child = spawn(tsxBin, [script, ...args], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
