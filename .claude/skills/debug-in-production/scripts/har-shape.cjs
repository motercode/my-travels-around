#!/usr/bin/env node
// Timeline of a HAR file with every value masked: host, path with ids and tokens hidden,
// parameter names, status, mime, redirect target, Sec-Fetch-*, initiator and attachment type.
// Values never appear: parameters listed in --allow are shown as is, those in --hash as a short
// salted fingerprint (equal values, equal fingerprint, within one run), the rest by name only.
// Cookies and other headers are never printed. Node 22, no dependencies.
//
//   node har-shape.cjs capture.har [--all] [--allow i,download] [--hash j,rapt] [--host regex]
// Origin: template «Extensión de Chrome» (takeoutDownloader). `.cjs` for "type": "module" repos.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');

const STATIC_TYPES = new Set(['script', 'stylesheet', 'image', 'font', 'media', 'manifest']);
const STATIC_PATH = /\.(m?js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map)$/i;

/** Short salted SHA-256 fingerprint: compares values without revealing them. */
function fingerprint(value, salt) {
  return crypto.createHash('sha256').update(`${salt}\0${value}`).digest('hex').slice(0, 8);
}

/** Path with uuids, long numbers and token-like segments replaced. */
function maskPath(pathname) {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/[A-Za-z0-9_-]{20,}/g, '<tok>')
    .replace(/\d{6,}/g, '<num>');
}

function shapeUrl(raw, base, options) {
  let url;
  try {
    url = new URL(raw, base);
  } catch {
    return '<invalid url>';
  }
  const params = [...url.searchParams.entries()].map(([name, value]) => {
    if (options.allow.includes(name)) return `${name}=${value}`;
    if (options.hash.includes(name)) return value ? `${name}=#${fingerprint(value, options.salt)}` : `${name}=`;
    if (/^https?:\/\//i.test(value)) {
      try {
        const nested = new URL(value);
        return `${name}=<${nested.host}${maskPath(nested.pathname)}>`;
      } catch { /* fall through: name only */ }
    }
    return name;
  });
  return `${url.host}${maskPath(url.pathname)}${params.length ? ` [${params.join(',')}]` : ''}`;
}

function header(headers, name) {
  const found = (headers || []).find((h) => h.name.toLowerCase() === name);
  return found ? found.value : undefined;
}

function isStatic(entry) {
  if (STATIC_TYPES.has(entry._resourceType)) return true;
  try {
    return STATIC_PATH.test(new URL(entry.request.url).pathname);
  } catch {
    return false;
  }
}

/**
 * @param {{log: {entries: object[]}}} har
 * @param {{allow?: string[], hash?: string[], salt?: string, all?: boolean, host?: RegExp}} [opts]
 * @returns {string[]} one masked line per request
 */
function summarizeHar(har, opts = {}) {
  const options = {
    allow: opts.allow || [],
    hash: opts.hash || [],
    salt: opts.salt || crypto.randomBytes(16).toString('hex'),
  };
  const entries = har.log.entries;
  if (!entries.length) return [];
  const t0 = new Date(entries[0].startedDateTime).getTime();
  const lines = [];
  for (const entry of entries) {
    if (!opts.all && isStatic(entry)) continue;
    if (opts.host) {
      let host = '';
      try { host = new URL(entry.request.url).host; } catch { /* keep empty */ }
      if (!opts.host.test(host)) continue;
    }
    const { request, response } = entry;
    const parts = [
      `+${((new Date(entry.startedDateTime).getTime() - t0) / 1000).toFixed(2)}s`,
      request.method,
      String(response.status),
      shapeUrl(request.url, undefined, options),
    ];
    const dest = header(request.headers, 'sec-fetch-dest');
    const site = header(request.headers, 'sec-fetch-site');
    const user = header(request.headers, 'sec-fetch-user');
    if (dest) parts.push(`dest=${dest}`);
    if (site) parts.push(`site=${site}`);
    if (user) parts.push(`user=${user}`);
    if (entry._initiator && entry._initiator.type) parts.push(`init=${entry._initiator.type}`);
    if (response.content) parts.push(`mime=${response.content.mimeType || '-'}`, `size=${response.content.size ?? '-'}`);
    const disposition = header(response.headers, 'content-disposition');
    if (disposition) {
      const ext = (disposition.match(/filename\*?=[^;]*?(\.[A-Za-z0-9]{1,6})["']?\s*(;|$)/) || [])[1];
      parts.push(/attachment/i.test(disposition) ? `attachment(${ext || '?'})` : 'inline');
    }
    const location = header(response.headers, 'location');
    if (location) parts.push(`-> ${shapeUrl(location, request.url, options)}`);
    lines.push(parts.join(' '));
  }
  return lines;
}

function parseArgs(argv) {
  const args = { all: false, allow: [], hash: [], file: undefined, host: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--allow') args.allow = argv[++i].split(',');
    else if (arg === '--hash') args.hash = argv[++i].split(',');
    else if (arg === '--host') args.host = new RegExp(argv[++i]);
    else args.file = arg;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('usage: har-shape.cjs capture.har [--all] [--allow i,download] [--hash j,rapt] [--host regex]');
    process.exit(2);
  }
  const har = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  for (const line of summarizeHar(har, args)) console.log(line);
}

module.exports = { summarizeHar, fingerprint, maskPath };
