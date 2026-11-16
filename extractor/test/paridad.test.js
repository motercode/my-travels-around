// Parity between lib/ (backend and scripts) and the copies inside the extension, which cannot
// import modules: content scripts and the service worker are classic scripts.
// While the duplication exists (see the `DT:` issue), both copies must give the same result.
// Values are synthetic: no real ids, keys or URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCanonicalMapsUrl } from '../lib/maps-url.js';
import { readExifTakenAt } from '../lib/exif-date.js';
import { loadExtension } from './helpers/extension.js';

const MAPS = 'https://www.google.com/maps';
const FAKE_USER = '1'.padEnd(21, '0');
const FAKE_PHOTO = 'AF1QipFAKEFAKEFAKEFAKEFAKEFAKEFAKE';

const URLS = [
  '',
  `${MAPS}/@39.4699,-0.3763,15z`,
  `${MAPS}/contrib/${FAKE_USER}/photos/@39.4699,-0.3763,3a,75y,90t/data=!3m8!1e2!3m6!1s${FAKE_PHOTO}!2e10!6sfake!7i4000!8i3000?entry=ttu`,
  `${MAPS}/contrib/${FAKE_USER}/photos/@39.4699,-0.3763,3a,75y,90t,13r/data=!3m10!1e2!3m8!1s${FAKE_PHOTO}!2e10!6sfake!7i4000!8i3000!9m2!1b1!2i46!4m3!8m2!3m1!1e1`,
  `${MAPS}/@39.4699,-0.3763,3a,75y,90t/data=!3m7!1e2!3m5!1s${FAKE_PHOTO}!2e10!3e11!6sfake!7i100`,
  `${MAPS}/place/Fake/data=!4m2!3m1!1s0x0:0x0`,
];

test('toCanonicalMapsUrl: content script and lib/maps-url.js agree', (t) => {
  const ext = loadExtension({ kind: 'content', url: `${MAPS}/` });
  t.after(() => ext.close());
  const inExtension = ext.get('toCanonicalMapsUrl');
  for (const url of URLS) assert.equal(inExtension(url), toCanonicalMapsUrl(url), url);
});

// --- Synthetic JPEG with an EXIF block -----------------------------------------------------

/** JPEG (SOI + APP1 Exif + SOS) whose TIFF has IFD0 DateTime and/or Exif DateTimeOriginal. */
const jpegWithExif = ({ dateTime, original, bigEndian = false } = {}) => {
  const le = !bigEndian;
  const tiff = [];
  const u16 = (v) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const ascii = (s) => [...Buffer.from(`${s}\0`, 'latin1')];
  const ifd0Entries = (dateTime ? 1 : 0) + (original ? 1 : 0);
  const ifd0 = 8;
  const ifd0Size = 2 + ifd0Entries * 12 + 4;
  const exifIfd = ifd0 + ifd0Size;
  const exifSize = original ? 2 + 12 + 4 : 0;
  let data = exifIfd + exifSize;
  const strings = [];
  const place = (s) => { const at = data; strings.push(...ascii(s)); data += s.length + 1; return at; };
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0));
  tiff.push(...u16(ifd0Entries));
  if (dateTime) tiff.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(place(dateTime)));
  if (original) tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd));
  tiff.push(...u32(0));
  if (original) tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(place(original)), ...u32(0));
  tiff.push(...strings);
  const app1 = [...Buffer.from('Exif\0\0', 'latin1'), ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 0xff, ...app1, 0xff, 0xda, 0x00, 0x02]);
};

const EXIF_CASES = {
  'DateTimeOriginal wins': { dateTime: '2024:01:02 03:04:05', original: '2023:07:08 09:10:11' },
  'only DateTime': { dateTime: '2024:01:02 03:04:05' },
  'big-endian TIFF': { original: '2022:12:31 23:59:58', bigEndian: true },
  'zero date': { original: '0000:00:00 00:00:00' },
  'no dates': {},
};

test('readExifTakenAt: service worker and lib/exif-date.js agree', (t) => {
  const ext = loadExtension({ kind: 'background' });
  t.after(() => ext.close());
  const inExtension = ext.get('readExifTakenAt');
  for (const [name, spec] of Object.entries(EXIF_CASES)) {
    const jpeg = jpegWithExif(spec);
    assert.equal(inExtension(jpeg.slice().buffer), readExifTakenAt(jpeg), name);
  }
  assert.equal(readExifTakenAt(jpegWithExif(EXIF_CASES['DateTimeOriginal wins'])), '2023-07-08T09:10:11');
  const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(inExtension(notJpeg.buffer), null);
  assert.equal(readExifTakenAt(notJpeg), null);
});

test('the content script answers the popup through its message listeners', async (t) => {
  const ext = loadExtension({ kind: 'content', url: `${MAPS}/` });
  t.after(() => ext.close());
  // Outside a profile's photo tab the shortcut refuses to start and says why.
  const response = await ext.send({ type: 'SHORTCUT_START', sessionId: 'test' });
  assert.equal(response.ok, false);
  assert.match(response.error, /contrib/);
});
