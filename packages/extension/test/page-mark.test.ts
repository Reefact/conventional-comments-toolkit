// La marque de page du journal de dégradation de sélecteurs (§9.4).
//
// Deux propriétés, et elles ne se ressemblent pas : `pageKey` décide de ce qui compte pour
// « la même page », `pageMark` en fait une colonne lisible. La seconde a une contrainte que
// rien d'autre n'exprime — une LARGEUR FIXE —, et c'est là que la première version se
// trompait : `padStart` complète sans tronquer, et 36⁶ est inférieur à 2³².

import { describe, expect, it } from 'vitest';
import { pageKey, pageMark } from '../src/page-mark.js';

const PR = 'https://github.com/Reefact/conventional-comments-toolkit/pull/48';

describe('§9.4 — ce qui fait « la même page »', () => {
  it('écarte les paramètres de requête et le fragment', () => {
    expect(pageKey(`${PR}/files?diff=split`)).toBe(`${PR}/files`);
    expect(pageKey(`${PR}/files#discussion_r3932637709`)).toBe(`${PR}/files`);
    expect(pageKey(`${PR}/files?diff=split#discussion_r1`)).toBe(`${PR}/files`);
  });

  it('garde le chemin : deux vues d’une même PR sont deux pages', () => {
    // `/files` et `/changes` servent des DOM différents — c'est précisément l'écart qu'un
    // diagnostic de sélecteurs doit rendre visible, jamais celui qu'il doit gommer.
    expect(pageKey(`${PR}/files`)).not.toBe(pageKey(`${PR}/changes`));
  });

  it('le slash final ne fait pas une seconde page', () => {
    expect(pageKey(`${PR}/files/`)).toBe(pageKey(`${PR}/files`));
    // La racine, elle, EST son slash : le retirer produirait une clé sans chemin du tout.
    expect(pageKey('https://github.com/')).toBe('https://github.com/');
  });

  it('rend `null` plutôt que de lever, sur une adresse inanalysable', () => {
    // Un journal de diagnostic ne fait jamais échouer son appelant : ici, la ligne perdrait
    // sa marque, elle ne ferait pas disparaître la dégradation.
    expect(pageKey('pas une url')).toBeNull();
    expect(pageKey('')).toBeNull();
  });

  it('rend `null` hors de `http:` et `https:`', () => {
    // C'est la liste blanche des schémas, et elle vaut pour la fabrication du lien : une
    // valeur relue du stockage ne devient pas un `href` sans que son schéma soit vérifié.
    expect(pageKey('javascript:alert(1)')).toBeNull();
    expect(pageKey('data:text/html,x')).toBeNull();
    // Une origine opaque rendrait la chaîne « null » comme origine, donc une clé absurde.
    expect(pageKey('about:blank')).toBeNull();
    expect(pageKey('http://github.example/a')).toBe('http://github.example/a');
  });
});

describe('§9.4 — la marque elle-même', () => {
  const keys = Array.from({ length: 500 }, (_, i) => `https://github.com/org${i}/repo/pull/${i * 7}/files`);

  it('fait SIX caractères, toujours', () => {
    // La colonne des marques précède celle des horodatages : une marque de sept caractères
    // décalerait sa ligne, et c'est ce que produit un `padStart` seul — 36⁶ vaut
    // 2 176 782 336 quand un hachage 32 bits en compte 4 294 967 296, donc près d'une valeur
    // sur deux déborde. Cinq cents clés suffisent à le voir : sans le modulo, ce test échoue
    // sur environ la moitié d'entre elles.
    const widths = new Set(keys.map((k) => pageMark(k).length));
    expect([...widths]).toEqual([6]);
  });

  it('est déterministe, et distingue', () => {
    expect(pageMark(`${PR}/files`)).toBe(pageMark(`${PR}/files`));
    expect(pageMark(`${PR}/files`)).not.toBe(pageMark(`${PR}/changes`));
    // Sur ce corpus, aucune collision : la marque distingue ce qu'elle a à distinguer.
    expect(new Set(keys.map(pageMark)).size).toBe(keys.length);
  });

  it('n’emploie que des caractères de base 36', () => {
    expect(keys.every((k) => /^[0-9a-z]{6}$/.test(pageMark(k)))).toBe(true);
  });
});
