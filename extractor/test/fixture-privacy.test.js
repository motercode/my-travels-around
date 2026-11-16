// Fixtures (saved real pages, network responses) must be anonymized before entering git:
// once a real value is in a public repository it stays in its history.
// Origin: template «Extensión de Chrome» (takeoutDownloader, test/fixture-privacy.test.js).
// Guide: docs/agentes/plantilla/fixture-anonimizado.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/extension.js';

const FIXTURES = path.join(ROOT, 'test', 'fixtures');
const TEXT = /\.(html?|json|jsonl|txt|js|css|svg)$/i;

// A fake value repeats one digit or says FAKE; a real one does not.
const isFakeNumber = (n) => /^(\d)\1+$/.test(n.slice(1)) || /^1(0+|1+)$/.test(n);
export const RULES = [
  { name: 'correo real', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, fake: (v) => /@example\.(com|org)$/i.test(v) },
  { name: 'userId de Google (21 dígitos)', re: /(?<!\d)1\d{20}(?!\d)/g, fake: isFakeNumber },
  { name: 'id de foto (AF1Qip…)', re: /AF1Qip[A-Za-z0-9_-]{20,}/g, fake: (v) => /FAKE/.test(v) },
  { name: 'clave de álbum compartido', re: /[?&]key=[A-Za-z0-9_-]{20,}/g, fake: (v) => /FAKE/.test(v) },
];

/** Real-looking values in `text`, as { rule, count } (never the values themselves). */
export const findLeaks = (text) =>
  RULES.map((r) => ({ rule: r.name, count: (text.match(r.re) || []).filter((v) => !r.fake(v)).length }))
    .filter((x) => x.count > 0);

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : [];

test('the detector catches real-looking values and lets fake ones through', () => {
  // Built at runtime so no real-looking literal sits in the repository.
  const realish = ['persona', '@', 'correo.es', ' ', '1', '23456789012345678901', ' AF1Qip', 'x'.repeat(10), 'Y'.repeat(20)].join('');
  assert.deepEqual(findLeaks(realish).map((l) => l.rule), ['correo real', 'userId de Google (21 dígitos)', 'id de foto (AF1Qip…)']);
  const fake = `usuario@example.com ${'1'.padEnd(21, '0')} AF1QipFAKEFAKEFAKEFAKEFAKEFAKE ?key=FAKEFAKEFAKEFAKEFAKEFAKE`;
  assert.deepEqual(findLeaks(fake), []);
});

test('no fixture carries real personal data', (t) => {
  const files = walk(FIXTURES).filter((f) => TEXT.test(f));
  if (!files.length) t.diagnostic('sin fixtures todavía: el test vigila test/fixtures/ en cuanto entre uno');
  for (const file of files) {
    const leaks = findLeaks(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(leaks, [], `${path.relative(ROOT, file)}: ${leaks.map((l) => `${l.count}× ${l.rule}`).join(', ')}`);
  }
});
