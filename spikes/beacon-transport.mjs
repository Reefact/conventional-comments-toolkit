// Transport de la télémétrie (§10) — ce que seul un vrai navigateur peut dire.
//
// Le module `telemetry.ts` repose sur UNE affirmation sur le navigateur : un POST
// `no-cors` vers une autre origine part, et le serveur le reçoit avec son corps, sans
// qu'aucune permission d'hôte ni aucun en-tête CORS n'entre en jeu. Toute l'économie du
// dispositif en dépend — c'est ce qui permet à la télémétrie de ne demander AUCUNE
// permission supplémentaire, là où la lecture du `configUrl` (PR #30), qui a besoin de la
// réponse, doit passer par le service worker.
//
// Cette affirmation-là ne se vérifie pas contre un faux `fetch` : un faux dirait ce qu'on
// a cru. Ce fichier sert donc une vraie page sur une origine, un vrai collecteur sur une
// autre, et regarde ce qui arrive.
//
// CE QU'IL NE VÉRIFIE PAS : la page ici n'est pas un script de contenu — le monde isolé
// n'est pas atteignable sans permission d'hôte (voir l'en-tête de mv3-smoke.mjs). Ce qui
// est mesuré est le comportement de l'ORIGINE DE LA PAGE, et c'est le bon proxy : depuis
// Chrome 85, un script de contenu « initiate requests on behalf of the web origin that the
// content script has been injected into » et suit donc exactement cette politique. Le lien
// entre les deux reste un raisonnement, pas une mesure — il est écrit ici pour qu'on
// puisse le contester.

import { chromium } from 'playwright-core';
import http from 'node:http';

const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition) });
  console.log(`  ${condition ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const collected = [];
const pageServer = await listen((_req, res) =>
  res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>origine A</title>')
);
// Collecteur sur une AUTRE origine : `localhost` et `127.0.0.1` sont des origines
// distinctes pour le navigateur, ce qui suffit à mettre la politique en jeu sans exiger de
// DNS ni de certificat.
const collector = await listen((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    collected.push({
      method: req.method,
      contentType: req.headers['content-type'],
      body,
      // Ce que la requête emporte D'ELLE-MÊME, sans qu'on l'ait mis dans le corps. C'est
      // ici que se vérifie la phrase de `PRIVACY.md` : « seuls les compteurs listés
      // quittent le navigateur ». Une revue a trouvé cette phrase fausse — le `Referer`
      // par défaut emporte l'URL de la page de revue — parce qu'elle avait été écrite de
      // mémoire, jamais mesurée (revue Codex, PR #31).
      referer: req.headers['referer'] ?? null,
      cookie: req.headers['cookie'] ?? null,
    });
    res.writeHead(204).end();
  });
});

const pageUrl = `http://127.0.0.1:${pageServer.address().port}/`;
const endpoint = `http://localhost:${collector.address().port}/collect`;

const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ['--no-sandbox'] });
try {
  console.log('Transport de la télémétrie — POST no-cors vers une autre origine\n');
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'load' });

  // Le cookie est posé PAR LA PAGE, sur son origine ; le collecteur est sur une autre
  // origine. `credentials: 'omit'` doit l'empêcher de suivre — mais un cookie d'origine
  // tierce ne serait de toute façon pas envoyé ici, donc ce test ne prouve que la moitié
  // de la phrase. Ce qu'il prouve entièrement, c'est l'absence de `Referer`.
  await page.evaluate(() => {
    document.cookie = 'cct_probe=1';
  });

  const payload = JSON.stringify({ v: 1, mode: 'enforce', repo: 'exemple/dépôt', counters: { 'label:issue': 4 } });
  const sent = await page.evaluate(
    async ([url, body]) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          keepalive: true,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body,
        });
        return { threw: false, type: res.type, status: res.status };
      } catch (e) {
        return { threw: true, error: String(e) };
      }
    },
    [endpoint, payload]
  );

  assert(
    'la page n’observe aucune erreur, et la réponse est opaque',
    !sent.threw && sent.type === 'opaque',
    JSON.stringify(sent)
  );

  for (let i = 0; i < 100 && collected.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const received = collected[0];
  assert(
    'le collecteur d’une autre origine reçoit le POST, corps intact',
    received?.method === 'POST' && received?.body === payload,
    JSON.stringify(received ?? null)
  );

  // Ce que la requête emporte en plus du corps. `PRIVACY.md` affirme que seuls les
  // compteurs listés quittent le navigateur : sans `referrerPolicy`, l'URL de la page de
  // revue partait dans le `Referer` et cette phrase était fausse. La mesurer ici la rend
  // vérifiable à chaque exécution, au lieu de reposer sur la mémoire de qui l'a écrite.
  assert(
    'la requête n’emporte NI referer NI cookie, comme PRIVACY.md l’affirme',
    received != null && received.referer === null && received.cookie === null,
    JSON.stringify({ referer: received?.referer ?? null, cookie: received?.cookie ?? null })
  );

  // Le pendant, et il compte pour l'honnêteté du dispositif : `no-cors` n'est pas une
  // permission d'émettre là où l'on n'en avait pas — un POST ORDINAIRE part lui aussi, et
  // c'est seulement sa RÉPONSE que le navigateur cache. `no-cors` est donc choisi pour ne
  // pas signaler une erreur qui n'en est pas une, pas pour contourner quoi que ce soit.
  const ordinary = await page.evaluate(async (url) => {
    try {
      await fetch(url, { method: 'POST', body: 'ordinaire' });
      return { threw: false };
    } catch (e) {
      return { threw: true, error: String(e) };
    }
  }, endpoint);
  for (let i = 0; i < 100 && collected.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert(
    'un POST ordinaire part aussi, mais la page le voit échouer',
    ordinary.threw && collected[1]?.body === 'ordinaire',
    JSON.stringify({ ordinary, reçus: collected.length })
  );
} finally {
  await browser.close();
  pageServer.close();
  collector.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions vérifiées dans un vrai navigateur.`);
if (failed.length > 0) {
  console.error(`\nÉchecs :\n${failed.map((f) => `  - ${f.name}`).join('\n')}`);
  process.exit(1);
}
