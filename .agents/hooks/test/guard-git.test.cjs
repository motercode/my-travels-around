// One hook script protects main for Claude Code, GitHub Copilot and Antigravity.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'guard-git.cjs');
let mainRepo;
let featureRepo;

function git(cwd, ...args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

function makeRepo(branch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-git-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init');
  if (branch !== 'main') git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}

before(() => {
  mainRepo = makeRepo('main');
  featureRepo = makeRepo('feat/issue-1-x');
});
after(() => {
  for (const dir of [mainRepo, featureRepo]) fs.rmSync(dir, { recursive: true, force: true });
});

const FORMATS = {
  claude: (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd }),
  copilot: (command, cwd) => ({ timestamp: 1, cwd, toolName: 'bash', toolArgs: JSON.stringify({ command }) }),
  antigravity: (command, cwd) => ({ toolCall: { name: 'run_command', args: { CommandLine: command } }, cwd }),
};

/** Runs the hook and normalizes each tool's answer to 'deny' | 'ask' | 'pass'. */
function decide(format, command, cwd) {
  const res = spawnSync('node', [HOOK], { input: JSON.stringify(FORMATS[format](command, cwd)), encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const out = res.stdout.trim() ? JSON.parse(res.stdout) : {};
  if (format === 'claude') return out.hookSpecificOutput?.permissionDecision ?? 'pass';
  if (format === 'copilot') return out.permissionDecision ?? 'pass';
  return { deny: 'deny', force_ask: 'ask' }[out.decision] ?? 'pass';
}

const CASES = [
  ['main', 'git commit -m "x"', 'deny'],
  ['main', 'git push', 'deny'],
  ['main', 'git merge feat/issue-1-x', 'deny'],
  ['main', 'git status', 'pass'],
  ['feature', 'git commit -m "x"', 'pass'],
  ['feature', 'git push -u origin feat/issue-1-x', 'pass'],
  ['feature', 'git push origin main', 'deny'],
  ['feature', 'git push origin HEAD:master', 'deny'],
  ['feature', 'git push --all origin', 'deny'],
  ['feature', 'gh pr merge 23 --squash', 'deny'],
  ['feature', 'ls && gh pr merge 23', 'deny'],
  ['feature', 'git push --force origin feat/issue-1-x', 'ask'],
  ['feature', 'npm test', 'pass'],
  ['feature', "cat > body.md <<'EOF'\nlos PR no se fusionan con gh pr merge\nEOF", 'pass'],
];

for (const format of Object.keys(FORMATS)) {
  for (const [where, command, expected] of CASES) {
    test(`${format}: on ${where}, "${command}" → ${expected}`, () => {
      assert.equal(decide(format, command, where === 'main' ? mainRepo : featureRepo), expected);
    });
  }

  test(`${format}: git -C <repo-on-main> commit is denied from another directory`, () => {
    assert.equal(decide(format, `git -C ${mainRepo} commit -m x`, featureRepo), 'deny');
  });
}

test('the first commit of a new repository is allowed on main, the push is not', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-git-unborn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q', '-b', 'main');
  for (const format of Object.keys(FORMATS)) {
    assert.equal(decide(format, 'git commit -m "chore: initial version"', dir), 'pass');
    assert.equal(decide(format, 'git push -u origin main', dir), 'deny');
  }
});

test('git add -A and git commit ask when sensitive files are present', () => {
  const har = path.join(featureRepo, 'session.har');
  fs.writeFileSync(har, '{}');
  try {
    for (const format of Object.keys(FORMATS)) assert.equal(decide(format, 'git add -A', featureRepo), 'ask');
    git(featureRepo, 'add', 'session.har');
    for (const format of Object.keys(FORMATS)) assert.equal(decide(format, 'git commit -m x', featureRepo), 'ask');
  } finally {
    git(featureRepo, 'rm', '-q', '--cached', 'session.har');
    fs.rmSync(har);
  }
  assert.equal(decide('claude', 'git add -A', featureRepo), 'pass');
});

test('the project patterns of sensibles.txt are read, comments and blank lines ignored', (t) => {
  const { extraSensitive } = require(HOOK);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'guard-git-extra-')), 'sensibles.txt');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.writeFileSync(file, '# comentario\n\n(^|/)datos-brutos/\n');
  const patterns = extraSensitive(file);
  assert.equal(patterns.length, 1);
  assert.ok(patterns[0].test('sub/datos-brutos/x.json'));
  assert.deepEqual(extraSensitive(path.join(os.tmpdir(), 'no-existe-sensibles.txt')), []);
});
