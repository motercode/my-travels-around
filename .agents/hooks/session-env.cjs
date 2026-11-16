#!/usr/bin/env node
// SessionStart hook: tells the agent which branch it is on, warns about local changes on main
// and about missing tools (npm, gh, node_modules). Claude Code and Antigravity format.
// Origin: template «Extensión de Chrome» (takeoutDownloader). The project name comes from the
// repository folder; the folders whose dependencies are checked, from PACKAGES.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function onPath(name) {
  return (process.env.PATH || '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));
}

// Folders with their own package.json and the dependency that proves `npm ci` ran there.
const PACKAGES = [
  { dir: '.', probe: 'node_modules' },
  { dir: 'extractor', probe: 'node_modules/jsdom' },
];

const payload = readStdin();
const root = payload.cwd || payload.workspacePaths?.[0] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const notes = [];

const branch = run('git', ['symbolic-ref', '--short', 'HEAD'], root) || run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root);
if (branch) {
  notes.push(`Rama actual: \`${branch}\`.`);
  const dirty = run('git', ['status', '--porcelain'], root);
  if (['main', 'master'].includes(branch) && dirty) {
    notes.push(`Aviso: hay cambios locales en \`${branch}\`; crea una rama \`tipo/issue-N-descripcion\` antes de hacer commit.`);
  } else if (!['main', 'master', 'HEAD'].includes(branch)) {
    const remote = run('git', ['rev-parse', '--verify', '--quiet', `origin/${branch}`], root);
    const ahead = run('git', ['rev-list', '--count', `origin/main..${branch}`], root);
    if (remote && ahead === '0') notes.push(`Aviso: \`${branch}\` no tiene commits por delante de \`origin/main\` (puede estar ya fusionada).`);
  }
}

if (!onPath('npm')) {
  notes.push('`npm` no está en el PATH: usa `.claude/skills/extension-test-and-pr/scripts/check.sh`, que lo obtiene con corepack.');
}
for (const { dir, probe } of PACKAGES) {
  const pkg = path.join(root, dir);
  if (fs.existsSync(path.join(pkg, 'package.json')) && !fs.existsSync(path.join(pkg, probe))) {
    notes.push(`Faltan las dependencias de \`${dir}\`: \`npm ci --ignore-scripts\` en esa carpeta.`);
  }
}
if (!onPath('gh')) notes.push('`gh` no está en el PATH: hace falta para issues y PR.');

const project = path.basename(run('git', ['rev-parse', '--show-toplevel'], root) || root);
const message = `Entorno de ${project} — ${notes.join(' ')}`;
if (payload.hook_event_name) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } }));
} else {
  process.stdout.write(JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: message } }] }));
}
