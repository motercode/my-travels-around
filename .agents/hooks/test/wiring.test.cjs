// Claude Code, GitHub Copilot and Antigravity run the same hook script (single source of truth).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

test('Claude Code, Copilot and Antigravity call .agents/hooks/guard-git.cjs', () => {
  const claude = read('.claude/settings.json').hooks.PreToolUse.find((h) => h.matcher === 'Bash');
  const copilot = read('.github/hooks/guard-git.json').hooks.preToolUse[0];
  const antigravity = read('.agents/hooks.json')['guard-git'].PreToolUse[0];
  assert.match(claude.hooks[0].command, /\.agents\/hooks\/guard-git\.cjs/);
  assert.match(copilot.bash, /\.agents\/hooks\/guard-git\.cjs/);
  assert.match(antigravity.hooks[0].command, /hooks\/guard-git\.cjs/);
  assert.ok(fs.existsSync(path.join(ROOT, '.agents', 'hooks', 'guard-git.cjs')));
});

test('Claude Code and Antigravity run the same SessionStart script', () => {
  const claude = read('.claude/settings.json').hooks.SessionStart[0].hooks[0];
  const antigravity = read('.agents/hooks.json')['session-env'].SessionStart[0];
  assert.match(claude.command, /\.agents\/hooks\/session-env\.cjs/);
  assert.match(antigravity.command, /hooks\/session-env\.cjs/);
});
