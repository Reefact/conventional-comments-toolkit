// Garde des pages capturées : aucune ne doit porter un secret de session non masqué
// (scripts/lib/captured-page-secrets.mjs dit lesquels et pourquoi).
//
// Usage :
//   node scripts/check-captured-pages.mjs            contrôle, sort 1 sur un secret restant
//   node scripts/check-captured-pages.mjs --redact   masque d'abord, en place, puis contrôle
//   node scripts/check-captured-pages.mjs --audit    liste les champs opaques communs à des
//                                                    PR différentes, par NOM, sans valeur
//
// Tout se fait sur la machine de qui a capturé, AVANT tout envoi : ce script et sa bibliothèque
// n'importent que des modules de Node, un clone superficiel suffit, sans `npm install`.
// `--redact` masque ce que la liste connaît ; `--audit` sert à une plateforme NOUVELLE, dont la
// liste ne connaît pas encore les champs (.claude/skills/plateforme/SKILL.md, étape 2). Aucun
// message ne recopie une valeur trouvée : un journal de CI est public, un rapport d'audit se
// transmet.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findCapturedPageSecrets, redactCapturedPage, sharedOpaqueFields } from './lib/captured-page-secrets.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ADAPTERS = join(ROOT, 'packages', 'adapters');
const redact = process.argv.includes('--redact');
const audit = process.argv.includes('--audit');

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

if (audit) {
  const fields = sharedOpaqueFields(pages.map((p) => readFileSync(p, 'utf8')));
  console.log(`Champs opaques communs à des PR différentes (${pages.length} page(s)), sans leurs valeurs :\n`);
  for (const f of fields) console.log(`  ${f.name} — ${f.prs} PR`);
  if (fields.length === 0) console.log('  (aucun — il faut des captures d\'au moins deux PR différentes)');
  console.log(
    "\nTrier : une donnée de session (jeton, identifiant de session, signature) va dans la liste de" +
      ' scripts/lib/captured-page-secrets.mjs ; une constante du site (empreinte de version) non.'
  );
  process.exit(0);
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
