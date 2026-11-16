// Runs the extension's scripts in jsdom exactly as manifest.json declares them, with a minimal
// `chrome` stub, so tests use the real code instead of a copy of it.
// Origin: template «Extensión de Chrome» (takeoutDownloader, test/helpers/content-script.js),
// extended for a service worker and for several onMessage listeners.
//
//   const ext = loadExtension({ kind: 'content', url: 'https://<host>/<ruta>' });
//   ext.get('someTopLevelConst')       // any top-level binding of the scripts
//   await ext.send({ type: 'PING' })   // the same message the popup or a script would send
//   ext.sent                           // messages the scripts sent with chrome.runtime.sendMessage
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXTENSION_DIR = path.join(ROOT, 'extension');
const BLANK = '<!doctype html><html><head></head><body></body></html>';

export const readManifest = () =>
  JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));

/** Chrome match pattern (`https://host/path*`) → RegExp. Enough for tests, not the full spec. */
const matchPattern = (pattern) =>
  new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('.*')}$`);

/**
 * Scripts the manifest runs for `kind`:
 *   'content'     content scripts of the isolated world whose `matches` cover `url`
 *   'main-world'  content scripts with `"world": "MAIN"` whose `matches` cover `url`
 *   'background'  the service worker
 */
export const manifestScripts = (kind, url) => {
  const manifest = readManifest();
  if (kind === 'background') return [manifest.background.service_worker];
  const wantMain = kind === 'main-world';
  return (manifest.content_scripts || [])
    .filter((cs) => (cs.world === 'MAIN') === wantMain)
    .filter((cs) => cs.matches.some((m) => matchPattern(m).test(url)))
    .flatMap((cs) => cs.js);
};

const chromeStub = (window, overrides = {}) => {
  const listeners = { message: [], installed: [] };
  const sent = [];
  const store = {};
  const storageArea = {
    get: (keys, cb) => {
      const list = keys == null ? Object.keys(store) : [].concat(typeof keys === 'object' && !Array.isArray(keys) ? Object.keys(keys) : keys);
      const out = Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
      cb?.(out);
      return Promise.resolve(out);
    },
    set: (items, cb) => { Object.assign(store, items); cb?.(); return Promise.resolve(); },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete store[k]; cb?.(); return Promise.resolve(); },
  };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      sendMessage: (message, cb) => {
        sent.push(JSON.parse(JSON.stringify(message)));
        if (typeof cb === 'function') window.setTimeout(() => cb(undefined), 0);
        return Promise.resolve(undefined);
      },
    },
    storage: { local: storageArea },
    ...overrides,
  };
  return { chrome, listeners, sent, store };
};

/** Fixture or blank DOM without running the page's own scripts; jsdom CSS errors are dropped. */
export const loadDom = ({ html = BLANK, file, url, onConsole } = {}) => {
  const virtualConsole = new VirtualConsole();
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    virtualConsole.on(level, (...args) => onConsole?.(level, args.map(String).join(' ')));
  }
  // "jsdomError" (CSS of third-party pages, navigation not implemented) is not forwarded.
  const text = file ? fs.readFileSync(file, 'utf8') : html;
  return new JSDOM(text, { url, runScripts: 'outside-only', virtualConsole });
};

/**
 * Loads the scripts of `kind` (see manifestScripts) into a jsdom window.
 * `fetch` rejects by default: tests never reach the network or the local backend.
 */
export const loadExtension = ({ kind = 'content', url = 'https://example.com/', html, file, onConsole, chrome: overrides, fetch } = {}) => {
  const dom = loadDom({ html, file, url, onConsole });
  const { window } = dom;
  const stub = chromeStub(window, overrides);
  window.chrome = stub.chrome;
  window.fetch = fetch || (() => Promise.reject(new Error('network disabled in tests')));
  const scripts = manifestScripts(kind, url);
  if (!scripts.length) throw new Error(`manifest.json declares no ${kind} scripts for ${url}`);
  // vm.Script, not window.eval: classic scripts share the global lexical scope (a top-level
  // `const` of one script is visible to the next one and to get()), eval code does not.
  const context = dom.getInternalVMContext();
  const run = (code, filename) => new vm.Script(code, { filename }).runInContext(context);
  for (const script of scripts) {
    run(fs.readFileSync(path.join(EXTENSION_DIR, script), 'utf8'), path.join(EXTENSION_DIR, script));
  }
  return {
    window,
    scripts,
    sent: stub.sent,
    store: stub.store,
    listeners: stub.listeners,
    /** Value of a top-level binding (`const`, `let`, `function`) of the loaded scripts. */
    get: (name) => run(name, `get(${name})`),
    /**
     * Delivers `message` to the onMessage listeners in order, as Chrome does: the first one that
     * answers wins; a listener that returns `true` answers later.
     */
    send(message, sender = {}) {
      return new Promise((resolve) => {
        let answered = false;
        const sendResponse = (r) => { if (!answered) { answered = true; resolve(r === undefined ? r : JSON.parse(JSON.stringify(r))); } };
        let pending = false;
        for (const fn of stub.listeners.message) {
          if (fn(message, sender, sendResponse) === true) pending = true;
          if (answered) return;
        }
        if (!pending) resolve(undefined);
      });
    },
    close: () => window.close(),
  };
};
