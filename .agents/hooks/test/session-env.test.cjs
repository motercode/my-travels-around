// SessionStart hook that reports the branch, local changes on main and missing tools.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'session-env.cjs');

function run(payload, env = {}) {
  const res = spawnSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

test('warns about local changes on main and about a missing npm', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-env-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
  // PATH with node and git only, so npm is missing on any machine (CI has npm next to node).
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'session-env-bin-'));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  fs.symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), path.join(bin, 'git'));

  const claude = run({ hook_event_name: 'SessionStart', cwd: dir }, { PATH: bin });
  const context = claude.hookSpecificOutput.additionalContext;
  assert.equal(claude.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(context, /Rama actual: `main`/);
  assert.match(context, /cambios locales en `main`/);
  assert.match(context, /npm/);

  const antigravity = run({ workspacePaths: [dir] }, { PATH: bin });
  assert.match(antigravity.injectSteps[0].systemMessage.systemMessage, /Rama actual: `main`/);
});
