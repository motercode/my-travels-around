// har-shape.cjs summarizes a HAR (requests, redirects, who started them) without printing
// any parameter value, cookie or header value, so the output can be pasted into an issue.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'har-shape.cjs');
const { summarizeHar, fingerprint } = require(SCRIPT);

const SECRETS = [
  'SECRET-TOKEN-VALUE-1234567890',
  '11111111-2222-3333-4444-555555555555',
  '987654321098765432109',
  'session-cookie-value',
  'user@example.com',
];
const [TOKEN, ARCHIVE, ACCOUNT] = SECRETS;

function entry({ t, url, status = 200, mime = 'text/html', location, initiator = 'other', fetchUser, disposition }) {
  const responseHeaders = [{ name: 'set-cookie', value: `SID=${SECRETS[3]}` }];
  if (location) responseHeaders.push({ name: 'location', value: location });
  if (disposition) responseHeaders.push({ name: 'content-disposition', value: disposition });
  const requestHeaders = [
    { name: 'cookie', value: `SID=${SECRETS[3]}` },
    { name: 'x-account', value: SECRETS[4] },
    { name: 'sec-fetch-dest', value: 'document' },
  ];
  if (fetchUser) requestHeaders.push({ name: 'sec-fetch-user', value: '?1' });
  return {
    startedDateTime: new Date(Date.UTC(2026, 10, 16, 10, 0, 0) + t).toISOString(),
    _resourceType: 'document',
    _initiator: { type: initiator },
    request: { method: 'GET', url, headers: requestHeaders },
    response: { status, headers: responseHeaders, content: { mimeType: mime, size: 1234 } },
  };
}

const HAR = {
  log: {
    entries: [
      entry({
        t: 0,
        url: `https://app.example.com/files/download?j=${ARCHIVE}&i=49&user=${ACCOUNT}&token=${TOKEN}`,
        status: 302,
        mime: 'application/binary',
        location: `https://app.example.com/manage/archive/${ARCHIVE}?user=${ACCOUNT}&token=${TOKEN}`,
        fetchUser: true,
      }),
      entry({
        t: 450,
        url: `https://app.example.com/settings/download?i=49&j=${ARCHIVE}&download=true&token=${TOKEN}`,
        status: 302,
        initiator: 'script',
        location: `https://cdn.example.net/download/${TOKEN}.zip?j=${ARCHIVE}&i=49`,
      }),
      entry({
        t: 900,
        url: `https://cdn.example.net/download/${TOKEN}.zip?j=${ARCHIVE}&i=49`,
        mime: 'application/octet-stream',
        disposition: `attachment; filename="archive-${ACCOUNT}.zip"`,
      }),
      entry({
        t: 1000,
        url: `https://accounts.example.com/challenge?continue=${encodeURIComponent(`https://app.example.com/files/download?token=${TOKEN}`)}`,
      }),
      entry({ t: 1100, url: 'https://static.example.com/app.js', mime: 'text/javascript' }),
    ],
  },
};

const OPTIONS = { allow: ['i', 'download'], hash: ['j', 'token'], salt: 'test-salt' };

test('prints no parameter, cookie or header value', () => {
  const output = summarizeHar(HAR, OPTIONS).join('\n');
  for (const secret of SECRETS) assert.ok(!output.includes(secret), `leaked ${secret}`);
});

test('shows the redirect chain, status, initiator and attachment type', () => {
  const lines = summarizeHar(HAR, OPTIONS);
  assert.equal(lines.length, 4, 'static assets are skipped by default');
  assert.match(lines[0], /GET 302 app\.example\.com\/files\/download .*-> app\.example\.com\/manage\/archive\/<uuid>/);
  assert.match(lines[0], /user=\?1/);
  assert.match(lines[1], /init=script/);
  assert.match(lines[1], /-> cdn\.example\.net\/download\/<tok>\.zip/);
  assert.match(lines[2], /attachment\(\.zip\)/);
  assert.match(lines[3], /continue=<app\.example\.com\/files\/download>/);
});

test('shows allowed parameters as is and hashed ones as matching fingerprints', () => {
  const lines = summarizeHar(HAR, OPTIONS);
  assert.match(lines[0], /i=49/);
  assert.match(lines[1], /download=true/);
  const tokenPrint = `token=#${fingerprint(TOKEN, 'test-salt')}`;
  assert.ok(lines[0].includes(tokenPrint) && lines[1].includes(tokenPrint), 'same value, same fingerprint');
  assert.match(lines[0], /\buser\b/, 'other parameters keep only their name');
  assert.doesNotMatch(lines[0], /user=[^?]/);
});

test('fingerprints depend on the salt', () => {
  assert.equal(fingerprint('x', 'a'), fingerprint('x', 'a'));
  assert.notEqual(fingerprint('x', 'a'), fingerprint('x', 'b'));
  assert.match(fingerprint('x', 'a'), /^[0-9a-f]{8}$/);
});

test('the CLI reads a HAR file and accepts --all, --allow and --hash', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'har-shape-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'capture.har');
  fs.writeFileSync(file, JSON.stringify(HAR));
  const output = execFileSync(process.execPath, [SCRIPT, file, '--all', '--allow', 'i', '--hash', 'token'], { encoding: 'utf8' });
  assert.equal(output.trim().split('\n').length, 5);
  assert.match(output, /i=49/);
  for (const secret of SECRETS) assert.ok(!output.includes(secret), `leaked ${secret}`);
});
