// Ce que `cache: 'reload'` fait d'une lecture de configuration — mesuré (§8.1.3, règle 3).
//
// Avant de bloquer un envoi, l'extension relit la configuration « en contournant son cache »
// (`bypassCache`, §9.2.3). Contourner le cache de l'extension ne suffit pas : la réponse d'une
// lecture ordinaire peut venir du cache HTTP du NAVIGATEUR, dès que le serveur l'y autorise
// (`Cache-Control: max-age=…`). Les adaptateurs et le relais passent donc `cache: 'reload'` à
// `fetch` quand on leur demande de contourner. Que cette option atteigne réellement le réseau
// est une affirmation sur le navigateur ; ce fichier la mesure, dans les DEUX contextes d'où la
// lecture part réellement :
//   - un SCRIPT DE CONTENU, pour le fichier de dépôt (`getRepoConfig()`, origine de la page) ;
//   - le SERVICE WORKER, pour le document d'organisation relayé (`cct-fetch-config`).
//
// Un serveur local répond `Cache-Control: max-age=300` et COMPTE les requêtes reçues. Pour
// chaque contexte : une première lecture (1 requête), une seconde ordinaire (servie par le
// cache : toujours 1 — sans cette contre-épreuve, la mesure ne prouverait rien), une lecture
// `reload` (2 requêtes), puis une ordinaire (toujours 2 : `reload` a rafraîchi le cache).
//
// CE QU'IL NE VÉRIFIE PAS : les redirections. La route `raw` de github.com redirige vers
// `raw.githubusercontent.com` ; ce que `reload` fait de la réponse mise en cache de la CIBLE
// d'une redirection n'est pas mesuré ici. Ni Firefox.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8751;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const hits = {};
const server = createServer((q, res) => {
  if (q.url === '/page.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><title>page</title><p>page</p>');
  }
  hits[q.url] = (hits[q.url] ?? 0) + 1;
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=300' });
  res.end(JSON.stringify({ n: hits[q.url] }));
}).listen(PORT, '127.0.0.1');

// La même séquence dans les deux contextes : sérialisée telle quelle (`toString`).
async function sequence(url, credentials) {
  const out = [];
  for (const cache of [undefined, undefined, 'reload', undefined]) {
    const init = cache ? { credentials, cache } : { credentials };
    const res = await fetch(url, init);
    out.push((await res.json()).n);
  }
  return out;
}

const ext = mkdtempSync(join(tmpdir(), 'cct-cache-ext-'));
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'cct cache probe',
    version: '1.0.0',
    background: { service_worker: 'sw.js' },
    host_permissions: [`${ORIGIN}/*`],
    content_scripts: [{ matches: [`${ORIGIN}/page.html`], js: ['cs.js'], run_at: 'document_idle' }],
  })
);
writeFileSync(join(ext, 'sw.js'), `self.sequence = ${sequence.toString()};`);
// Le script de contenu écrit son relevé sur la page : son monde isolé n'est pas atteignable
// depuis l'outil de test, le DOM, lui, est partagé.
writeFileSync(
  join(ext, 'cs.js'),
  `${sequence.toString()}
sequence('${ORIGIN}/repo.json', 'same-origin').then(
  (r) => document.documentElement.setAttribute('data-result', JSON.stringify(r)),
  (e) => document.documentElement.setAttribute('data-result', JSON.stringify(String(e)))
);`
);

console.log('\ncache: reload — le cache HTTP du navigateur est-il contourné ? (Cache-Control: max-age=300)\n');

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cct-cache-')), {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath(),
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});
try {
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/page.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-result'), null, { timeout: 20000 });
  const cs = JSON.parse(await page.evaluate(() => document.documentElement.getAttribute('data-result')));
  const sw = await worker.evaluate((u) => self.sequence(u, 'include'), `${ORIGIN}/org.json`);

  const expected = JSON.stringify([1, 1, 2, 2]);
  assert(
    'script de contenu : la lecture ordinaire est servie par le cache, `reload` atteint le serveur et rafraîchit le cache',
    JSON.stringify(cs) === expected,
    `réponses ${JSON.stringify(cs)}, requêtes reçues ${hits['/repo.json'] ?? 0}`
  );
  assert(
    'service worker : idem',
    JSON.stringify(sw) === expected,
    `réponses ${JSON.stringify(sw)}, requêtes reçues ${hits['/org.json'] ?? 0}`
  );
} finally {
  await ctx.close();
  server.close();
  rmSync(ext, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai navigateur.`);
process.exit(failed.length === 0 ? 0 : 1);
