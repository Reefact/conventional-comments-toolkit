import { describe, expect, it } from 'vitest';
import {
  splitBody,
  normalizePrefixLine,
  hasDiscussion,
  hasOwnContent,
  containsSuggestionBlock,
} from '../src/preprocess.js';

describe('§3.4.1 — prétraitement normatif', () => {
  it('étape 1 : découpe sur /\\r?\\n/, jamais sur \\n seul (CA-18)', () => {
    const lf = splitBody('issue: x\n\ncorps');
    const crlf = splitBody('issue: x\r\n\r\ncorps');
    expect(lf.prefixLine).toBe('issue: x');
    expect(crlf.prefixLine).toBe('issue: x'); // un \r résiduel casserait le match
  });

  it('étape 2 : écarte les blocs de code délimités — la ligne suivante porte le préfixe', () => {
    const body = '```\nconst a = 1;\n{\n```\nissue: accolade citée au-dessus';
    const split = splitBody(body);
    expect(split.prefixLine).toBe('issue: accolade citée au-dessus');
  });

  it('étape 2 : écarte les citations Markdown (>)', () => {
    const split = splitBody('> du code cité\n> encore\nissue: sous la citation');
    expect(split.prefixLine).toBe('issue: sous la citation');
  });

  it('étape 2 : bloc ~~~ également ; fence non refermée écarte jusqu’à la fin', () => {
    expect(splitBody('~~~\ncode\n~~~\ntodo: ok').prefixLine).toBe('todo: ok');
    expect(splitBody('```\ntout est du code\nissue: jamais vu').prefixLine).toBeNull();
  });

  it('étape 3 : première ligne restante non vide', () => {
    expect(splitBody('\n   \n  issue: décalée').prefixLine).toBe('issue: décalée');
  });

  it('étape 4 : retire en tête et en queue \\p{White_Space} et U+FEFF (CA-06, CA-18)', () => {
    expect(normalizePrefixLine('\uFEFF  issue: x  \t')).toBe('issue: x');
    expect(normalizePrefixLine('\u00A0issue: x\u00A0')).toBe('issue: x'); // insécable de bordure
  });

  it('étape 5 : blancs Unicode internes hors espace/tab → espace ordinaire, sans diagnostic', () => {
    // Une insécable avant le deux-points devient une espace : le motif 4 devient exact (§3.4.1).
    expect(normalizePrefixLine('issue\u00A0: x')).toBe('issue : x');
    expect(normalizePrefixLine('issue:\u202Fsujet')).toBe('issue: sujet');
  });

  it('étape 6 : U+FEFF interne supprimé, jamais remplacé par une espace', () => {
    // `issue` + BOM + `:` doit retomber sur `issue: x`, qui est conforme (§3.4.1).
    expect(normalizePrefixLine('issue\uFEFF: x')).toBe('issue: x');
    // Placé après le deux-points : disparaît et laisse `issue:sujet` (motif 5 exact).
    expect(normalizePrefixLine('issue:\uFEFFsujet')).toBe('issue:sujet');
  });

  it('corps vide, blanc, ou tout écarté → aucune ligne de préfixe (exemption §4.2)', () => {
    expect(splitBody('').prefixLine).toBeNull();
    expect(splitBody('   \n\t\n').prefixLine).toBeNull();
    expect(splitBody('> tout cité\n> rien d’autre').prefixLine).toBeNull();
  });

  it('la discussion est tout ce qui entoure la ligne de préfixe, lignes écartées comprises (§3.1)', () => {
    const cited = splitBody('```\ncode\n```\nissue: sous le bloc');
    expect(hasDiscussion(cited)).toBe(true); // le bloc cité EST de la discussion
    const bare = splitBody('issue: seul');
    expect(hasDiscussion(bare)).toBe(false);
    const after = splitBody('issue: avec corps\n\nexplication');
    expect(hasDiscussion(after)).toBe(true);
  });

  it('contenu propre : blocs délimités, citations et blancs retirés (§4.2)', () => {
    expect(hasOwnContent(splitBody('> cité\n```\ncode\n```\n  '))).toBe(false);
    expect(hasOwnContent(splitBody('> cité\nune phrase'))).toBe(true);
  });

  it('bloc de suggestion : détecté par son info string, sur le corps brut (§3.5.1 étage 0)', () => {
    expect(containsSuggestionBlock('```suggestion\nfix\n```', 'suggestion')).toBe(true);
    expect(containsSuggestionBlock('```suggestion\r\nfix\r\n```', 'suggestion')).toBe(true);
    expect(containsSuggestionBlock('```js\ncode\n```', 'suggestion')).toBe(false);
    // Plateforme sans marqueur établi : pas d'étage 0 (§3.5.1, §B.6).
    expect(containsSuggestionBlock('```suggestion\nfix\n```', null)).toBe(false);
  });
});
