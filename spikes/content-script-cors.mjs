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
// Aucun test unitaire ne peut voir ça : un faux `fetch` rend ce qu'on lui dit de rendre.
// Ce fichier reproduit les quatre situations dans un vrai Chromium, avec une extension
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
  ];
  const out = {};
  for (const [name, url, init] of cases) {
    try { const r = await fetch(url, init); out[name] = 'HTTP ' + r.status; }
    catch { out[name] = 'THREW'; }
  }
  document.title = 'DONE ' + JSON.stringify(out);
})();`
);

const pageServer = createServer((req, res) => {
  if (req.url === '/present.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"version":1}'); }
  if (req.url === '/missing.json') { res.writeHead(404); return res.end(); }
  if (req.url === '/redirect-nocors.json') { res.writeHead(302, { location: `http://127.0.0.1:${PLAIN}/x.json` }); return res.end(); }
  if (req.url === '/redirect-cors.json') { res.writeHead(302, { location: `http://127.0.0.1:${CORS}/ok.json` }); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>attente</title>');
}).listen(PAGE, '127.0.0.1');
const plainServer = createServer((_q, res) => { res.writeHead(200); res.end('{}'); }).listen(PLAIN, '127.0.0.1');
const corsServer = createServer((_q, res) => {
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
  assert('la même lecture SANS cookies passe — ce que fait getRepoConfig()', seen['redirect-cors-omit'] === 'HTTP 200', seen['redirect-cors-omit']);
} finally {
  await ctx.close();
  pageServer.close(); plainServer.close(); corsServer.close();
  rmSync(ext, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai navigateur.`);
process.exit(failed.length === 0 ? 0 : 1);
