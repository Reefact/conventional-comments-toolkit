// Garde des pages capturées : aucune ne doit porter un secret de session non masqué
// (scripts/lib/captured-page-secrets.mjs dit lesquels et pourquoi).
//
// Usage :
//   node scripts/check-captured-pages.mjs            contrôle, sort 1 sur un secret restant
//   node scripts/check-captured-pages.mjs --redact   masque d'abord, en place, puis contrôle
//
// `--redact` est le chemin d'une NOUVELLE capture : déposer le fichier dans
// `packages/adapters/<id>/test/fixtures/pages/`, lancer la commande, relire le diff. Le message
// d'erreur ne recopie jamais la valeur trouvée : un journal de CI est public.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findCapturedPageSecrets, redactCapturedPage } from './lib/captured-page-secrets.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ADAPTERS = join(ROOT, 'packages', 'adapters');
const redact = process.argv.includes('--redact');

const pages = [];
for (const id of readdirSync(ADAPTERS)) {
  const dir = join(ADAPTERS, id, 'test', 'fixtures', 'pages');
  try {
    if (!statSync(dir).isDirectory()) continue;
  } catch {
    continue; // pas de pages capturées pour cette plateforme
  }
  for (const f of readdirSync(dir)) if (f.endsWith('.html')) pages.push(join(dir, f));
}

const failures = [];
for (const page of pages) {
  let html = readFileSync(page, 'utf8');
  if (redact) {
    const masked = redactCapturedPage(html);
    if (masked !== html) {
      writeFileSync(page, masked);
      console.log(`  masqué : ${relative(ROOT, page)}`);
      html = masked;
    }
  }
  const secrets = findCapturedPageSecrets(html);
  if (secrets.length > 0) {
    const kinds = [...new Set(secrets.map((s) => s.kind))].join(', ');
    failures.push(`${relative(ROOT, page)} : ${secrets.length} secret(s) non masqué(s) — ${kinds}`);
  }
}

if (failures.length > 0) {
  console.error(`✗ pages capturées : des secrets de session restent en clair.\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('\nMasquer : node scripts/check-captured-pages.mjs --redact — puis relire le diff.');
  process.exit(1);
}
console.log(`✓ pages capturées : aucun secret de session en clair (${pages.length} page(s)).`);
