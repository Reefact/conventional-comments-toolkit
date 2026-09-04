// Ce qu'un SCRIPT DE CONTENU a le droit de lire — mesuré, jamais rappelé (§9.4).
//
// Trois documents de ce dépôt ont affirmé que la lecture de `.conventional-comments.json`
// était « une requête same-origin », donc sans frontière CORS. C'est vrai de la REQUÊTE et
// faux de la REDIRECTION : `github.com/<o>/<r>/raw/HEAD/<f>` redirige vers
// `raw.githubusercontent.com` dès que le fichier existe, et cette origine répond
// `Access-Control-Allow-Origin: *`. Le navigateur refuse ce joker quand la requête porte
// `credentials: 'include'`. La lecture levait donc sur TOUT dépôt possédant une
// configuration — le niveau « dépôt » du §8.2 n'a jamais fonctionné sur GitHub, et le
// bandeau du §5.4 s'affichait précisément là où il y avait quelque chose à lire.
//
// Ce que la mesure a appris ENSUITE, et qui ne se devine pas : `credentials: 'same-origin'`
// traverse cette redirection. Le premier saut, de même origine, part AVEC la session — donc
// GitHub autorise ; la redirection franchit une origine, le navigateur cesse d'envoyer les
// cookies, et le joker est accepté. Un dépôt PRIVÉ redevient lisible sans permission d'hôte.
// Les deux moitiés sont vérifiées ici : le code de retour ET qui a reçu les cookies.
//
// Aucun test unitaire ne peut voir ça : un faux `fetch` rend ce qu'on lui dit de rendre.
// Ce fichier reproduit ces situations dans un vrai Chromium, avec une extension
// SANS permission d'hôte — la configuration réelle du manifeste depuis la PR #28.
//
// CE QU'IL NE VÉRIFIE PAS, et il faut le dire : il n'atteint pas github.com (pas de session,
// et le proxy de CI n'est pas un navigateur de confiance). Il mesure les RÈGLES du
// navigateur sur des origines locales équivalentes ; que github.com redirige et réponde
// `ACAO: *` est constaté séparément, par `curl -I`, et cité dans l'adaptateur.

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGE = 8731; // origine de la page
const PLAIN = 8732; // autre origine, sans en-tête CORS
const CORS = 8733; // autre origine, `ACAO: *` — comme raw.githubusercontent.com

const results = [];
function assert(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const ext = mkdtempSync(join(tmpdir(), 'cct-cors-ext-'));
mkdirSync(join(ext, '.'), { recursive: true });
writeFileSync(
  join(ext, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'cct cors probe',
    version: '1.0.0',
    // AUCUNE `host_permissions` : c'est la configuration livrée (PR #28).
    permissions: ['storage'],
    content_scripts: [{ matches: [`http://127.0.0.1:${PAGE}/*`], js: ['cs.js'], run_at: 'document_end' }],
  })
);
writeFileSync(
  join(ext, 'cs.js'),
  `(async () => {
  const cases = [
    ['same-origin-include', location.origin + '/present.json', { credentials: 'include' }],
    ['same-origin-absent', location.origin + '/missing.json', { credentials: 'include' }],
    ['redirect-nocors-include', location.origin + '/redirect-nocors.json', { credentials: 'include' }],
    ['redirect-cors-include', location.origin + '/redirect-cors.json', { credentials: 'include' }],
    ['redirect-cors-omit', location.origin + '/redirect-cors.json', { credentials: 'omit' }],
    ['redirect-cors-sameorigin', location.origin + '/redirect-cors.json', { credentials: 'same-origin' }],
  ];
  const out = {};
  for (const [name, url, init] of cases) {
    try { const r = await fetch(url, init); out[name] = 'HTTP ' + r.status; }
    catch { out[name] = 'THREW'; }
  }
  // LE RECEVEUR DE \`fetch\`, mesure separee : le monde isole ne repond pas comme la page.
  // Un adaptateur qui range \`fetch\` dans un champ et l'appelle comme methode (\`this.#f(u)\`)
  // passe l'instance en receveur. Dans le monde PRINCIPAL, Chromium l'accepte ; ici, non.
  class Holder { #f = fetch; call(u) { return this.#f(u, { credentials: 'same-origin' }); } }
  try { await new Holder().call(location.origin + '/present.json'); out['receiver-field'] = 'OK'; }
  catch (e) { out['receiver-field'] = 'THREW ' + e.message; }
  class Bound { #f = fetch.bind(globalThis); call(u) { return this.#f(u, { credentials: 'same-origin' }); } }
  try { await new Bound().call(location.origin + '/present.json'); out['receiver-bound'] = 'OK'; }
  catch (e) { out['receiver-bound'] = 'THREW ' + e.message; }
  document.title = 'DONE ' + JSON.stringify(out);
})();`
);

// Le cookie mesure la MOITIÉ que le code de retour ne dit pas : qui a été authentifié.
const cookiesSeen = {};
const pageServer = createServer((req, res) => {
  cookiesSeen[req.url] = req.headers.cookie ?? null;
  if (req.url === '/present.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"version":1}'); }
  if (req.url === '/missing.json') { res.writeHead(404); return res.end(); }
  if (req.url === '/redirect-nocors.json') { res.writeHead(302, { location: `http://127.0.0.1:${PLAIN}/x.json` }); return res.end(); }
  if (req.url === '/redirect-cors.json') { res.writeHead(302, { location: `http://127.0.0.1:${CORS}/ok.json` }); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'session=secret; Path=/' });
  res.end('<title>attente</title>');
}).listen(PAGE, '127.0.0.1');
const plainServer = createServer((_q, res) => { res.writeHead(200); res.end('{}'); }).listen(PLAIN, '127.0.0.1');
const corsSeen = {};
const corsServer = createServer((q, res) => {
  corsSeen[q.url] = q.headers.cookie ?? null;
  res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' });
  res.end('{"version":1}');
}).listen(CORS, '127.0.0.1');

console.log("\nCORS d'un script de contenu — extension SANS permission d'hôte\n");

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cct-cors-')), {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--no-sandbox'],
});
try {
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PAGE}/`);
  await page.waitForFunction(() => document.title.startsWith('DONE'), null, { timeout: 20000 });
  const seen = JSON.parse((await page.title()).slice('DONE '.length));

  assert('une lecture de MÊME ORIGINE passe, sans permission d’hôte', seen['same-origin-include'] === 'HTTP 200', seen['same-origin-include']);
  assert('un fichier absent rend 404, pas une erreur — cas nominal (§10)', seen['same-origin-absent'] === 'HTTP 404', seen['same-origin-absent']);
  assert('une REDIRECTION vers une origine sans CORS lève', seen['redirect-nocors-include'] === 'THREW', seen['redirect-nocors-include']);
  // LE défaut : `ACAO: *` ne vaut RIEN avec des cookies. C'est le cas de raw.githubusercontent.com.
  assert('`ACAO: *` + `credentials: include` lève — le joker exclut les cookies', seen['redirect-cors-include'] === 'THREW', seen['redirect-cors-include']);
  assert('la même lecture SANS cookies passe', seen['redirect-cors-omit'] === 'HTTP 200', seen['redirect-cors-omit']);
  // CE QUE FAIT getRepoConfig() : authentifié au premier saut, anonyme après la redirection.
  assert('`same-origin` traverse la redirection — ce que fait getRepoConfig()', seen['redirect-cors-sameorigin'] === 'HTTP 200', seen['redirect-cors-sameorigin']);
  assert('… en AYANT authentifié le premier saut — un dépôt privé reste lisible', cookiesSeen['/redirect-cors.json'] === 'session=secret', String(cookiesSeen['/redirect-cors.json']));
  // LE DÉFAUT LIVRÉ, et pourquoi aucun test unitaire ne pouvait le voir : un faux `fetch` est
  // une fonction ordinaire, qui accepte n'importe quel receveur. Le vrai, dans le monde isolé
  // d'un script de contenu, exige le sien — l'adaptateur rangeait `fetch` dans un champ privé
  // et l'appelait comme méthode, donc avec l'instance en receveur : TOUTE lecture de
  // configuration levait, et le bandeau du §5.4 s'affichait sur chaque dépôt, avec ou sans
  // fichier. Sondé d'abord dans le monde PRINCIPAL, où Chromium l'accepte, le défaut s'était
  // déclaré introuvable : la mesure était bonne, le monde ne l'était pas.
  assert('`fetch` rangé dans un champ et appelé comme méthode LÈVE dans le monde isolé', String(seen['receiver-field']).startsWith('THREW'), String(seen['receiver-field']));
  assert('… et lié à son global, il passe — ce que fait l’adaptateur', seen['receiver-bound'] === 'OK', String(seen['receiver-bound']));
  assert('… et SANS envoyer le cookie après la redirection — le joker l’exige', corsSeen['/ok.json'] === null, String(corsSeen['/ok.json']));
} finally {
  await ctx.close();
  pageServer.close(); plainServer.close(); corsServer.close();
  rmSync(ext, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai navigateur.`);
process.exit(failed.length === 0 ? 0 : 1);
