// Ce qu'un SERVICE WORKER MV3 a le droit de lire à travers une redirection — mesuré (§9.4).
//
// Le relais `cct-fetch-config` existe parce qu'un script de contenu émet ses requêtes au nom
// de l'origine de la page : un `configUrl` hébergé ailleurs ne lui est pas lisible. On en
// déduit volontiers que le worker, lui, « échappe au CORS » dès qu'il a la permission
// d'hôte. C'est vrai de l'URL DEMANDÉE, et faux de la CIBLE d'une redirection, qui n'est
// dans aucune permission : `github.com/<o>/<r>/raw/...` redirige vers
// `raw.githubusercontent.com`, et cette origine répond `ACAO: *`, joker que le navigateur
// refuse aux requêtes porteuses de cookies. Le relais prenait donc le même mur que le script
// de contenu, dans un contexte où l'on croyait le problème absent.
//
// Ce fichier pose la question au navigateur, avec une extension qui n'a la permission que de
// l'origine de DÉPART — exactement la situation du relais, dont la politique d'entreprise
// pré-autorise l'hôte du `configUrl` et lui seul.
//
// CE QU'IL NE VÉRIFIE PAS : il n'atteint pas github.com (pas de session, et le proxy de CI
// n'est pas un navigateur de confiance). Il mesure les RÈGLES du navigateur sur des origines
// locales équivalentes ; que github.com redirige et réponde `ACAO: *` est constaté séparément
// par `curl -I`, et cité dans l'adaptateur.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GRANTED = 8741; // origine EN permission d'hôte — le `configUrl` pré-autorisé
const CORS = 8742; // cible de la redirection, `ACAO: *` — comme raw.githubusercontent.com
const PLAIN = 8743; // cible de la redirection, sans en-tête CORS

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const ext = mkdtempSync(join(tmpdir(), 'cct-relay-ext-'));
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'cct relay probe',
    version: '1.0.0',
    background: { service_worker: 'sw.js' },
    // La permission porte sur l'origine DEMANDÉE, jamais sur celle où l'on est redirigé.
    host_permissions: [`http://127.0.0.1:${GRANTED}/*`],
  })
);
writeFileSync(join(ext, 'sw.js'), 'self.__ready = true;');

const grantedSeen = {};
const grantedServer = createServer((q, res) => {
  grantedSeen[q.url] = q.headers.cookie ?? null;
  if (q.url === '/redirect-cors.json') {
    res.writeHead(302, { location: `http://127.0.0.1:${CORS}/ok.json` });
    return res.end();
  }
  if (q.url === '/redirect-plain.json') {
    res.writeHead(302, { location: `http://127.0.0.1:${PLAIN}/ok.json` });
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=secret; Path=/' });
  res.end('{"version":1}');
}).listen(GRANTED, '127.0.0.1');
const corsSeen = {};
const corsServer = createServer((q, res) => {
  corsSeen[q.url] = q.headers.cookie ?? null;
  res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' });
  res.end('{"version":1}');
}).listen(CORS, '127.0.0.1');
const plainServer = createServer((_q, res) => { res.writeHead(200); res.end('{}'); }).listen(PLAIN, '127.0.0.1');

console.log("\nCORS d'un service worker MV3 — permission d'hôte sur l'origine de DÉPART seulement\n");

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cct-relay-')), {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});
try {
  let [worker] = ctx.serviceWorkers();
  if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  // Poser le cookie sur l'origine accordée : sans lui, « la session accompagne la requête »
  // ne se distinguerait pas de « il n'y avait rien à envoyer ».
  await worker.evaluate((u) => fetch(u, { credentials: 'include' }).then((r) => r.status), `http://127.0.0.1:${GRANTED}/seed.json`);

  const seen = await worker.evaluate(async (base) => {
    const cases = [
      ['direct-include', base + '/plain.json', 'include'],
      ['redirect-cors-include', base + '/redirect-cors.json', 'include'],
      ['redirect-cors-sans-cookies', base + '/redirect-cors.json', 'same-origin'],
      ['redirect-plain-include', base + '/redirect-plain.json', 'include'],
    ];
    const out = {};
    for (const [name, url, credentials] of cases) {
      try { const r = await fetch(url, { credentials }); out[name] = 'HTTP ' + r.status; }
      catch { out[name] = 'THREW'; }
    }
    return out;
  }, `http://127.0.0.1:${GRANTED}`);

  // Ce que le worker peut, et qu'un script de contenu ne peut pas : lire une AUTRE origine,
  // avec la session. C'est la raison d'être du relais, et elle tient.
  assert("une lecture directe d'une origine accordée passe, avec ses cookies", seen['direct-include'] === 'HTTP 200', seen['direct-include']);
  assert('… et la session l’accompagne bien', grantedSeen['/plain.json'] === 'session=secret', String(grantedSeen['/plain.json']));
  // LE défaut : la permission ne couvre pas la CIBLE de la redirection.
  assert('une REDIRECTION vers `ACAO: *` LÈVE avec des cookies — comme dans une page', seen['redirect-cors-include'] === 'THREW', seen['redirect-cors-include']);
  assert('la même lecture sans cookies passe — ce que fait le relais', seen['redirect-cors-sans-cookies'] === 'HTTP 200', seen['redirect-cors-sans-cookies']);
  assert('… sans cookie après la redirection — le joker l’exige', corsSeen['/ok.json'] === null, String(corsSeen['/ok.json']));
  assert('une REDIRECTION vers une origine sans CORS lève', seen['redirect-plain-include'] === 'THREW', seen['redirect-plain-include']);
} finally {
  await ctx.close();
  grantedServer.close(); corsServer.close(); plainServer.close();
  rmSync(ext, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai navigateur.`);
process.exit(failed.length === 0 ? 0 : 1);
