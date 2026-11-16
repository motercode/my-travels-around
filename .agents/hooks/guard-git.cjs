#!/usr/bin/env node
// PreToolUse hook shared by Claude Code, GitHub Copilot and Antigravity.
// Origin: template «Extensión de Chrome» (takeoutDownloader, ADR-0009). `.cjs` because the
// repository's package.json may declare "type": "module".
// Reads the tool call from stdin, recognises each tool's format and answers in that format.
//
//   deny  → commit, push or merge while on main/master (except the first commit of a new repo); push to main/master from any branch;
//           push --all/--mirror; gh pr merge (merging is the author's job).
//   ask   → push --force; git add -A / git commit with sensitive files (HAR, real pages, captures,
//           plus one regular expression per line in .agents/hooks/sensibles.txt, the project's own).
//   pass  → anything else (the tool's normal permission flow applies).
//
// It is a convenience for agents, not a security boundary: the real guard is GitHub's
// branch protection on main.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PROTECTED = new Set(['main', 'master']);
const SENSITIVE = [/\.har$/i, /(^|\/)paginas-reales\//i, /(^|\/)capturas\//i, /(^|\/)(Captura|Screenshot)[^/]*\.png$/i, /\.pem$/i, /(^|\/)\.env$/i];
const EXTRA_SENSITIVE_FILE = path.join(__dirname, 'sensibles.txt');

/** Project patterns: one regular expression per line; blank lines and `#` comments ignored. */
function extraSensitive(file = EXTRA_SENSITIVE_FILE) {
  try {
    return require('node:fs').readFileSync(file, 'utf8').split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')).map((l) => new RegExp(l, 'i'));
  } catch {
    return [];
  }
}

function readStdin() {
  try {
    return JSON.parse(require('node:fs').readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/** Returns { tool, command, cwd } for the three supported payload formats. */
function parsePayload(p) {
  if (p.tool_input || p.hook_event_name) {
    return { tool: 'claude', command: p.tool_input?.command ?? '', cwd: p.cwd };
  }
  if (p.toolCall) {
    return { tool: 'antigravity', command: p.toolCall.args?.CommandLine ?? '', cwd: p.cwd ?? p.workspacePaths?.[0] };
  }
  if ('toolArgs' in p || 'toolName' in p) {
    let args = p.toolArgs;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = { command: args }; }
    }
    return { tool: 'copilot', command: args?.command ?? '', cwd: p.cwd };
  }
  return { tool: 'claude', command: '', cwd: undefined };
}

function gitOut(cwd, ...args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Splits a shell line into simple commands (good enough for policy checks, not a shell parser). */
function segments(command) {
  return command.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
}

function tokenize(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^(["'])(.*)\1$/, '$2'));
}

/** Parses `git [-C dir] [-c k=v] <sub> args…`, skipping leading env assignments. */
function parseGit(tokens, cwd) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (path.basename(tokens[i] || '') !== 'git') return null;
  i++;
  let dir = cwd;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    if (tokens[i] === '-C') { dir = path.resolve(cwd, tokens[i + 1] || '.'); i += 2; continue; }
    if (tokens[i] === '-c') { i += 2; continue; }
    i++;
  }
  return { sub: tokens[i], args: tokens.slice(i + 1), dir };
}

function isGhPrMerge(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  return path.basename(tokens[i] || '') === 'gh' && tokens[i + 1] === 'pr' && tokens[i + 2] === 'merge';
}

function targetsProtected(arg) {
  const ref = arg.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');
  return PROTECTED.has(ref);
}

function sensitiveIn(files) {
  const patterns = [...SENSITIVE, ...extraSensitive()];
  return files.filter((f) => patterns.some((re) => re.test(f)));
}

function evaluate(command, cwd) {
  for (const segment of segments(command)) {
    const tokens = tokenize(segment);
    if (isGhPrMerge(tokens)) {
      return { decision: 'deny', reason: 'Bloqueado: los PR los fusiona el autor, nunca un agente (gh pr merge).' };
    }
    const g = parseGit(tokens, cwd);
    if (!g) continue;
    const branch = gitOut(g.dir, 'symbolic-ref', '--short', 'HEAD') || gitOut(g.dir, 'rev-parse', '--abbrev-ref', 'HEAD');
    // Exception: the first commit of a new repository (no main yet to open a PR against).
    const unborn = !gitOut(g.dir, 'rev-parse', '--verify', '--quiet', 'HEAD');

    if (g.sub === 'commit' && unborn) continue;
    if (['commit', 'push', 'merge'].includes(g.sub) && PROTECTED.has(branch)) {
      return { decision: 'deny', reason: `Bloqueado: estás en \`${branch}\`. Crea una rama \`tipo/issue-N-descripcion\` y abre un PR.` };
    }
    if (g.sub === 'push') {
      if (g.args.some((a) => a === '--all' || a === '--mirror')) {
        return { decision: 'deny', reason: 'Bloqueado: git push --all/--mirror también sube main. Sube solo tu rama.' };
      }
      if (g.args.filter((a) => !a.startsWith('-')).slice(1).some(targetsProtected)) {
        return { decision: 'deny', reason: 'Bloqueado: no se sube a main/master. Sube tu rama y abre un PR.' };
      }
      if (g.args.some((a) => /^(--force|--force-with-lease|-f)(=|$)/.test(a) || /^\+/.test(a))) {
        return { decision: 'ask', reason: 'git push --force reescribe la rama remota. Confirma que es lo que quieres.' };
      }
    }
    if (g.sub === 'add' && g.args.some((a) => a === '-A' || a === '--all' || a === '.')) {
      const changed = gitOut(g.dir, 'status', '--porcelain', '--untracked-files=all')
        .split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop());
      const hits = sensitiveIn(changed);
      if (hits.length) return { decision: 'ask', reason: `Hay ficheros sensibles sin ignorar (${hits.slice(0, 5).join(', ')}). Revisa git status antes de añadirlo todo.` };
    }
    if (g.sub === 'commit') {
      const hits = sensitiveIn(gitOut(g.dir, 'diff', '--cached', '--name-only').split('\n').filter(Boolean));
      if (hits.length) return { decision: 'ask', reason: `Ficheros sensibles en staging (${hits.slice(0, 5).join(', ')}): nada personal ni credencial entra en git.` };
    }
  }
  return { decision: 'pass' };
}

function respond(tool, { decision, reason }) {
  if (decision === 'pass') {
    // Claude Code and Copilot: no output means "no opinion". Antigravity expects an answer.
    if (tool === 'antigravity') process.stdout.write(JSON.stringify({ decision: 'ask' }));
    return;
  }
  if (tool === 'claude') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
    }));
  } else if (tool === 'copilot') {
    process.stdout.write(JSON.stringify({ permissionDecision: decision, permissionDecisionReason: reason }));
  } else {
    process.stdout.write(JSON.stringify({ decision: decision === 'ask' ? 'force_ask' : 'deny', reason }));
  }
}

function main() {
  const { tool, command, cwd } = parsePayload(readStdin());
  const root = cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  respond(tool, command ? evaluate(command, root) : { decision: 'pass' });
}

if (require.main === module) main();

module.exports = { evaluate, parsePayload, extraSensitive };
