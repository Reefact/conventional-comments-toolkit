// La note de version publiée par `release.yml` est LUE dans un fichier rédigé à la main, jamais
// dérivée de l'historique : un sujet de commit explique un diff à un relecteur, une note de
// version explique une version à quelqu'un qui décide s'il met à jour. Ce fichier fixe les deux
// propriétés dont dépend ce choix — la bonne section est extraite, et son absence REFUSE.
import { describe, expect, it } from 'vitest';

// @ts-expect-error — script d'outillage en JavaScript simple, sans déclarations de types.
import { extractSection, notesPathOf } from '../scripts/release-notes.mjs';
import { readFileSync } from 'node:fs';

const NOTES = `# Release notes — 1.x

Intro.

## 1.1.0 — March 2, 2026

_Résumé de 1.1.0._

- Une entrée.

## 1.0.0 — January 5, 2026

_Résumé de 1.0.0._

- Une autre entrée.

## 1.0.0-beta.1 — January 2, 2026

_Résumé de la bêta._
`;

describe("extraction d'une section de notes de version", () => {
  it('rend la section demandée, titre compris, et rien de la suivante', () => {
    const section = extractSection(NOTES, '1.1.0');
    expect(section).toContain('## 1.1.0 — March 2, 2026');
    expect(section).toContain('Une entrée.');
    expect(section).not.toContain('1.0.0'); // la section suivante s'arrête net
  });

  it('rend la DERNIÈRE section jusqu’à la fin du fichier', () => {
    const section = extractSection(NOTES, '1.0.0-beta.1');
    expect(section).toContain('_Résumé de la bêta._');
  });

  it('ne confond jamais une version avec une pré-version qui la préfixe', () => {
    // Sans frontière de mot, « ## 1.0.0-beta.1 » répondrait à une demande pour « 1.0.0 » — et la
    // release stable publierait la note d'une bêta. Ici, chacune rend bien la sienne.
    expect(extractSection(NOTES, '1.0.0')).toContain('_Résumé de 1.0.0._');
    expect(extractSection(NOTES, '1.0.0')).not.toContain('_Résumé de la bêta._');
  });

  it('rend null quand la version n’a pas de section — c’est ce qui fait refuser la publication', () => {
    expect(extractSection(NOTES, '2.0.0')).toBeNull();
    expect(extractSection(NOTES, '1.1.1')).toBeNull();
  });

  it('traite la version comme une DONNÉE, jamais comme un motif', () => {
    // Elle vient d'un tag. Un point non échappé ferait correspondre n'importe quel caractère,
    // et « 1x0x0 » répondrait pour « 1.0.0 ».
    expect(extractSection('## 1x1x0 — March 2, 2026\n\n- x\n', '1.1.0')).toBeNull();
  });

  it('ouvre un fichier par version MAJEURE', () => {
    expect(notesPathOf('1.0.0-beta.8')).toBe('docs/release-notes-1.x-en.md');
    expect(notesPathOf('2.3.4')).toBe('docs/release-notes-2.x-en.md');
  });
});

/** Versions annoncées par un fichier de notes, dans l'ordre du document. */
function versionsIn(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/^## (\S+)/gm)].map((m) => m[1]!);
}

describe('les notes réellement livrées', () => {
  it('portent EXACTEMENT les mêmes versions en français qu’en anglais', () => {
    // Le garde de `release.yml` ne lit que l'anglais — c'est lui que porte la Release GitHub.
    // Rien ne rappellerait donc de tenir le français à jour, et il dériverait en silence.
    // Comparer les deux LISTES, plutôt que d'exiger une version nommée ici : une assertion sur
    // « la version du jour » se périmerait à chaque release, et un test qu'il faut rééditer pour
    // rester vrai finit par être édité sans être relu.
    expect(versionsIn('docs/release-notes-1.x-fr.md')).toEqual(versionsIn('docs/release-notes-1.x-en.md'));
  });

  it('portent une section pour chaque version, extractible par le garde', () => {
    const path = 'docs/release-notes-1.x-en.md';
    const notes = readFileSync(path, 'utf8');
    const versions = versionsIn(path);
    expect(versions.length).toBeGreaterThan(0); // un fichier vide passerait la boucle sans rien dire
    for (const version of versions) {
      expect(extractSection(notes, version), `section ${version} inextractible`).not.toBeNull();
    }
  });
});
