// Note de version d'UNE release, lue TELLE QUELLE dans `docs/release-notes-<majeure>.x-en.md`
// — une réécriture orientée produit de la section correspondante du CHANGELOG, rédigée à la
// main AVANT que le tag ne soit posé.
//
// Rien n'est dérivé de `git log`, et c'est le fond de l'affaire : un sujet de commit explique un
// diff à un relecteur, une note de version explique une version à quelqu'un qui décide s'il
// met à jour. Le corps de Release ne disait jusqu'ici RIEN de ce qui avait changé — que des
// instructions d'installation —, et le dériver de l'historique aurait mis « fix(extension):
// widen the textless-writes guard » sous les yeux d'un lecteur à qui ce nom ne dit rien.
//
// REFUSE (sortie 1) plutôt que de produire un repli quand le fichier, ou la section de cette
// version, n'existe pas : une release en cours de publication est le mauvais moment pour
// découvrir que personne n'a écrit ce qu'elle contient. Un repli silencieusement moins bon
// ressemble à une note de version sans en être une ; un job rouge, lui, se voit et dit quoi
// écrire.
//
// Usage : node scripts/release-notes.mjs <version>
//   `1.0.0-beta.8` → la section « ## 1.0.0-beta.8 … » sur la sortie standard.
//   Se lance tel quel en local, avant de poser le tag, pour vérifier qu'il passera.

import { readFileSync } from 'node:fs';

/** Le fichier est par MAJEURE : une 2.x ouvre son propre fichier plutôt que de faire grossir
 * le premier indéfiniment. Le français vit à côté (`-fr.md`) — la Release GitHub porte
 * l'anglais, qui est ce que lit quiconque arrive sur le dépôt. */
export function notesPathOf(version) {
  const major = String(version).split('.')[0];
  return `docs/release-notes-${major}.x-en.md`;
}

/** Délimiteur de bloc de code ouvert ou fermé par cette ligne, ou null. Approximation assumée
 * de CommonMark : trois caractères ou plus, `` ` `` ou `~`, indentés d'au plus trois espaces.
 * Ce qui compte ici n'est pas de rendre le Markdown, c'est de ne pas prendre une ligne de
 * CONTENU pour une frontière de section. */
function fenceDelimiter(line) {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match === null ? null : match[1];
}

/** Section d'UNE version : de son titre `## <version>` jusqu'au prochain `## ` de PREMIER
 * niveau, ou la fin du fichier.
 *
 * Les titres à l'intérieur d'un bloc de code délimité ne comptent pas — ni pour ouvrir la
 * section, ni pour la fermer (revue Reefact, PR #46). Une note qui montre une commande
 * contenant `## install` dans un bloc ```sh` était sinon tronquée à cette ligne, et la Release
 * publiait un bloc de code laissé OUVERT — alors même que ce script annonce lire la section
 * « telle quelle ».
 *
 * Rend null pour une section VIDE autant que pour une section absente : un titre seul passait
 * le garde et laissait publier une release sans un mot sur ce qui avait changé, ce que ce
 * fichier existe précisément pour empêcher.
 *
 * La frontière de mot après la version n'est pas un détail : sans elle, `## 1.0.0-beta.1`
 * répondrait à une demande pour `1.0.0`, et la release stable publierait la note d'une bêta.
 * La version vient d'un tag — c'est une DONNÉE, jamais un motif : elle est échappée avant
 * d'entrer dans l'expression régulière, où `.` et `-` ont tous deux un sens. */
export function extractSection(markdown, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const heading = new RegExp(`^## ${escaped}(?:\\s|$)`);
  let open = null; // délimiteur du bloc de code en cours, ou null
  let title = null;
  const body = [];
  for (const line of String(markdown).split('\n')) {
    const fence = fenceDelimiter(line);
    if (open !== null) {
      // Seule une clôture du MÊME caractère et au moins aussi longue referme le bloc.
      if (fence !== null && fence[0] === open[0] && fence.length >= open.length) open = null;
      if (title !== null) body.push(line);
      continue;
    }
    if (fence !== null) {
      open = fence;
      if (title !== null) body.push(line);
      continue;
    }
    if (title === null) {
      if (heading.test(line)) title = line;
      continue;
    }
    if (line.startsWith('## ')) break;
    body.push(line);
  }
  if (title === null) return null;
  const text = body.join('\n').trim();
  return text === '' ? null : `${title}\n${text}`;
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('release-notes.mjs')) {
  const version = process.argv[2] ?? '';
  const path = notesPathOf(version);
  const fail = (message) => {
    console.error(message);
    console.error(`::error file=${path}::${message.replaceAll('\n', '%0A')}`);
    process.exit(1);
  };
  if (version === '') fail('usage : node scripts/release-notes.mjs <version>');
  let markdown;
  try {
    markdown = readFileSync(path, 'utf8');
  } catch {
    fail(`${path} n'existe pas — écrivez les notes de cette version majeure avant de poser le tag.`);
  }
  const section = extractSection(markdown, version);
  if (section === null) {
    fail(
      `${path} ne porte aucune section « ## ${version} » qui dise quelque chose — absente, ` +
        `ou réduite à son seul titre. Écrivez-la avant de poser le tag.`
    );
  }
  console.log(section);
}
