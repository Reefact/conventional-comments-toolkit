// La note de version publiée par `release.yml` est LUE dans un fichier rédigé à la main, jamais
// dérivée de l'historique : un sujet de commit explique un diff à un relecteur, une note de
// version explique une version à quelqu'un qui décide s'il met à jour. Ce fichier fixe les deux
// propriétés dont dépend ce choix — la bonne section est extraite, et son absence REFUSE.
import { describe, expect, it } from 'vitest';

// @ts-expect-error — script d'outillage en JavaScript simple, sans déclarations de types.
import { closesFence, extractSection, fenceOpener, notesPathOf } from '../scripts/release-notes.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

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

  it('ne coupe pas sur un titre écrit DANS un bloc de code (revue Reefact, PR #46)', () => {
    // Une note qui montre une commande peut contenir « ## install » dans un bloc ```sh. Couper
    // là tronquait la section ET laissait la fence ouverte — la Release publiait alors un bloc
    // de code jamais refermé, sous un script qui annonce lire la section « telle quelle ».
    const notes = ['## 1.1.0 — March 2, 2026', '', '```sh', '## install', '```', '', '- après le bloc', '', '## 1.0.0 — January 5, 2026', '', '- ailleurs'].join('\n');
    const section = extractSection(notes, '1.1.0');
    expect(section).toContain('## install'); // le contenu du bloc est gardé…
    expect(section).toContain('- après le bloc'); // …et la section continue au-delà
    expect(section).not.toContain('ailleurs'); // la vraie section suivante, elle, arrête bien
    expect((section!.match(/```/g) ?? []).length % 2).toBe(0); // fence refermée
  });

  it('ne s’ouvre pas non plus sur un titre écrit dans un bloc de code', () => {
    const notes = ['# Notes', '', '```md', '## 2.0.0 — un exemple, pas une version', '```', ''].join('\n');
    expect(extractSection(notes, '2.0.0')).toBeNull();
  });

  it('ne prend pas une ligne fence-like SUIVIE DE TEXTE pour une clôture (revue Reefact, PR #46)', () => {
    // Une clôture ne peut être suivie que d'espaces. Dans un bloc ouvert par quatre backticks,
    // « ````pas-une-clôture » est du contenu ; la traiter en clôture rouvrait le défaut d'un
    // cran plus bas — le `##` suivant redevenait une frontière et la note repartait tronquée.
    const notes = [
      '## 1.1.0 — March 2, 2026',
      '',
      '````md',
      '````pas-une-clôture',
      '## un titre DANS le bloc',
      '````',
      '',
      '- après le bloc',
      '',
      '## 1.0.0 — January 5, 2026',
      '',
      '- ailleurs',
    ].join('\n');
    const section = extractSection(notes, '1.1.0');
    expect(section).toContain('- après le bloc'); // la section va jusqu'au bout
    expect(section).toContain('## un titre DANS le bloc'); // gardé comme contenu, pas lu comme frontière
    expect(section).not.toContain('ailleurs'); // la vraie voisine arrête toujours
    // Compter les délimiteurs ne dirait rien ici : la ligne de CONTENU en porte elle-même. Ce
    // qui prouve que le bloc s'est refermé au bon endroit, c'est que la section se poursuit
    // au-delà de lui et s'arrête sur la vraie section suivante — les deux assertions ci-dessus.
    expect(section!.trimEnd().endsWith('- après le bloc')).toBe(true);
  });

  it('refuse une section réduite à son seul titre — publier sans un mot est ce qu’on empêche', () => {
    const notes = ['## 1.1.0 — March 2, 2026', '', '   ', '', '## 1.0.0 — January 5, 2026', '', '- du contenu'].join('\n');
    expect(extractSection(notes, '1.1.0')).toBeNull();
    expect(extractSection(notes, '1.0.0')).toContain('- du contenu'); // la voisine reste lisible
  });

  it('ouvre un fichier par version MAJEURE', () => {
    expect(notesPathOf('1.0.0-beta.8')).toBe('docs/release-notes-1.x-en.md');
    expect(notesPathOf('2.3.4')).toBe('docs/release-notes-2.x-en.md');
  });
});

/** Les lignes du document, celles d'un bloc de code délimité remplacées par `null` — ouverture,
 * contenu et clôture comprises. Le tableau reste ALIGNÉ sur le fichier, pour qu'un message
 * d'erreur puisse nommer un vrai numéro de ligne.
 *
 * Deux tests de ce fichier ont besoin de la même distinction, et chacun s'était trompé tout
 * seul (revue Reefact, PR #47) : `versionsIn` prenait un `## install` écrit dans un bloc ```sh`
 * pour une version nommée « install » — un format qu'`extractSection` accepte explicitement,
 * plus bas dans ce fichier — et le garde de repli suivait les blocs avec un basculement trop
 * permissif. Une seule réponse, bâtie sur les fonctions du script, plutôt que deux qui dérivent.
 */
function outsideFences(markdown: string): (string | null)[] {
  let open: string | null = null;
  return markdown.split('\n').map((line) => {
    if (open !== null) {
      if (closesFence(line, open)) open = null;
      return null;
    }
    const opener = fenceOpener(line);
    if (opener !== null) {
      open = opener;
      return null;
    }
    return line;
  });
}

/** Versions annoncées par un fichier de notes, dans l'ordre du document — jamais un titre
 * écrit à l'intérieur d'un bloc de code. */
function versionsIn(path: string): string[] {
  const versions: string[] = [];
  for (const line of outsideFences(readFileSync(path, 'utf8'))) {
    const match = line === null ? null : /^## (\S+)/.exec(line);
    if (match !== null) versions.push(match[1]!);
  }
  return versions;
}

/** Toutes les majeures livrées, DÉCOUVERTES sur le disque — jamais une liste écrite ici. Le
 * jour où une 2.x ouvre son fichier (`notesPathOf`), ce test le prend sans être réédité ;
 * nommer « 1.x » le laisserait vert sur un train qu'il ne regarde pas (revue Reefact, PR #46). */
function deliveredMajors(): string[] {
  return readdirSync('docs')
    .map((name) => /^release-notes-(\d+)\.x-en\.md$/.exec(name)?.[1])
    .filter((major): major is string => major !== undefined)
    .sort();
}

describe('les notes réellement livrées', () => {
  it('couvrent au moins une majeure — sinon les boucles ci-dessous ne diraient rien', () => {
    expect(deliveredMajors().length).toBeGreaterThan(0);
  });

  it('portent EXACTEMENT les mêmes versions en français qu’en anglais, pour CHAQUE majeure', () => {
    // Le garde de `release.yml` ne lit que l'anglais — c'est lui que porte la Release GitHub.
    // Rien ne rappellerait donc de tenir le français à jour, et il dériverait en silence.
    // Comparer les deux LISTES, plutôt que d'exiger une version nommée ici : une assertion sur
    // « la version du jour » se périmerait à chaque release, et un test qu'il faut rééditer pour
    // rester vrai finit par être édité sans être relu.
    for (const major of deliveredMajors()) {
      const fr = `docs/release-notes-${major}.x-fr.md`;
      expect(existsSync(fr), `${fr} manquant`).toBe(true);
      expect(versionsIn(fr), `divergence ${major}.x`).toEqual(versionsIn(`docs/release-notes-${major}.x-en.md`));
    }
  });

  it('n’ont AUCUNE puce ni paragraphe replié à la main dans une section PUBLIÉE', () => {
    // Une note est collée telle quelle dans un corps de Release, qui est du « user content »
    // comme un commentaire : GitHub y rend une simple fin de ligne en SAUT DE LIGNE littéral —
    // le fait même sur lequel repose le rendu du §5.5 de ce dépôt. Une puce repliée à la main,
    // qui se lit comme de la prose dans un fichier du dépôt, arrive donc hachée en plein milieu
    // d'une phrase sur la page de la Release. Huit releases ont été publiées ainsi avant que
    // cette règle ne soit écrite (skill release-notes de Reefact/just-dummies).
    //
    // La longueur des lignes n'est PAS bornée en retour : c'est l'éditeur qui replie à
    // l'affichage, pas le fichier.
    //
    // Le garde ne lit QUE les sections de version, jamais le préambule qui les précède : lui
    // n'est collé nulle part, et il est replié depuis toujours. Et il ne demande pas « la ligne
    // précédente est-elle une puce ? » — première rédaction, qui laissait passer un paragraphe
    // ordinaire replié alors que la règle vaut aussi pour lui (revue Reefact, PR #47) — mais
    // « cette ligne suit-elle une ligne non vide sans ouvrir un bloc à elle ? ». Des puces
    // consécutives ouvrent chacune le leur ; une continuation, non.
    //
    // Les blocs de code se suivent avec `fenceOpener` / `closesFence`, les fonctions MÊMES
    // d'`extractSection`, plutôt qu'avec un basculement sur tout préfixe de fence — qui prenait
    // ```` ````pas-une-clôture ```` pour une clôture, désynchronisait l'état, et rendait le garde
    // MUET sur tout ce qui suivait le bloc (revue Reefact, PR #47). Un garde qui se tait sans
    // le dire est pire que pas de garde ; et deux définitions de « qu'est-ce qu'un bloc de
    // code » dans le même dépôt divergent tôt ou tard, alors on n'en garde qu'une.
    const OUVRE_UN_BLOC = /^ {0,3}(#|[-*+] |\d+[.)] |\||>)/;
    for (const major of deliveredMajors()) {
      for (const lang of ['en', 'fr']) {
        const path = `docs/release-notes-${major}.x-${lang}.md`;
        // Dans un bloc de code, le retour à la ligne est le CONTENU : il ne se déplie pas, et
        // une ligne collée juste après la clôture ouvre un paragraphe plutôt qu'elle n'en
        // continue un. `outsideFences` rend les deux d'un coup — le bloc vaut frontière.
        const lignes = outsideFences(readFileSync(path, 'utf8'));
        const première = lignes.findIndex((line) => line?.startsWith('## ') === true);
        expect(première, `${path} sans aucune section`).toBeGreaterThanOrEqual(0);
        lignes.forEach((line, index) => {
          if (index < première || line === null) return;
          const previous = lignes[index - 1] ?? '';
          const isContinuation =
            previous.trim() !== '' && line.trim() !== '' && !OUVRE_UN_BLOC.test(line);
          expect(isContinuation, `${path}:${index + 1} replie la ligne précédente`).toBe(false);
        });
      }
    }
  });

  it('portent une section NON VIDE pour chaque version, dans les DEUX langues', () => {
    // Sur les deux fichiers, pas seulement l'anglais que lit le garde (revue Reefact, PR #46) :
    // une section française réduite à son titre garde exactement la même LISTE de versions, donc
    // le test d'égalité ci-dessus reste vert — et le corps de Release renverrait vers une note
    // française vide. Cette PR promet des notes bilingues et vient d'ajouter le refus des
    // sections vides ; l'appliquer à une langue sur deux ne tiendrait ni l'une ni l'autre.
    for (const major of deliveredMajors()) {
      const english = `docs/release-notes-${major}.x-en.md`;
      const versions = versionsIn(english);
      expect(versions.length, `${english} sans aucune version`).toBeGreaterThan(0);
      for (const lang of ['en', 'fr']) {
        const path = `docs/release-notes-${major}.x-${lang}.md`;
        const notes = readFileSync(path, 'utf8');
        for (const version of versions) {
          // Une section réduite à son titre rend null : le garde refuserait, ce test aussi.
          expect(extractSection(notes, version), `section ${version} vide ou inextractible (${lang})`).not.toBeNull();
        }
      }
      for (const version of versions) {
        expect(notesPathOf(version), `${version} lue dans le mauvais fichier`).toBe(english);
      }
    }
  });
});
