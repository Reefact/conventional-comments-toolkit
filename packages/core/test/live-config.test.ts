// §8.1.3 règle 1 — la configuration résolue à l'instant s'applique, dans les DEUX sens.
//
// Ce fichier remplace `pinning.test.ts`, dont le sujet entier a disparu avec l'épinglage
// (§6.4, §9.2.2). Ses dix-huit tests affirmaient qu'une PR déjà ouverte gardait la
// configuration de son ouverture — exactement l'inverse de ce que `CA-30` demande
// aujourd'hui.
//
// Une précision de méthode, parce qu'elle décide de ce que ces tests valent. « S'applique aux
// PR DÉJÀ OUVERTES » n'est plus une propriété observable de `resolveConfig()` : la fonction
// n'a plus aucune entrée propre à une PR, donc aucun moyen d'en traiter une différemment.
// C'est le TYPE qui le garantit désormais, pas une assertion. Ce qui reste testable, et
// testé ici, est l'autre moitié : que la valeur résolue suive le document courant dans les
// deux sens — un durcissement comme un assouplissement. C'est ce second sens que raterait un
// cliquet, et c'est lui que la moitié « durcissement » d'un critère ne verrait jamais.

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/resolve.js';
import type { ConfigRead, Floor } from '../src/types.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });

/** La configuration effective pour un document de dépôt, sous un plancher optionnel. */
function resolved(repo: object, floor: Floor | null = null) {
  return resolveConfig(floor, absent, found(repo)).config;
}

describe('CA-30 — configuration en direct, dans les deux sens', () => {
  it('désactiver un label prend effet, et le réactiver aussi', () => {
    expect(resolved({ labels: [{ id: 'chore', enabled: false }] }).labels.find((l) => l.id === 'chore')!.enabled).toBe(false);
    expect(resolved({ labels: [{ id: 'chore', enabled: true }] }).labels.find((l) => l.id === 'chore')!.enabled).toBe(true);
  });

  it('durcir une sévérité prend effet, et l’abaisser aussi', () => {
    expect(resolved({ severities: { 'W-CASE': 'error' } }).severities['W-CASE']).toBe('error');
    // `off` sur un code `W-` est admis ; la limite basse du §8.2 ne vise que les `E-`.
    expect(resolved({ severities: { 'W-CASE': 'off' } }).severities['W-CASE']).toBe('off');
  });

  it('allonger `minSubjectLength` prend effet, et le raccourcir aussi', () => {
    expect(resolved({ rules: { minSubjectLength: 30 } }).rules.minSubjectLength).toBe(30);
    expect(resolved({ rules: { minSubjectLength: 2 } }).rules.minSubjectLength).toBe(2);
  });

  it('retirer un compte de `exemptUsers` prend effet — aucune union avec un passé', () => {
    // L'épinglage unissait par ENTRÉE : un retrait restait sans effet sur les PR ouvertes.
    // Le document courant fait désormais foi, et lui seul.
    expect(resolved({ exemptUsers: ['bot-a', 'bot-b'] }).exemptUsers.sort()).toEqual(['bot-a', 'bot-b']);
    expect(resolved({ exemptUsers: ['bot-b'] }).exemptUsers).toEqual(['bot-b']);
  });

  it('`decorations.allowFree` et `scope.validateReplies` suivent le document, aller et retour', () => {
    expect(resolved({ decorations: { allowFree: false } }).decorations.allowFree).toBe(false);
    expect(resolved({ decorations: { allowFree: true } }).decorations.allowFree).toBe(true);
    expect(resolved({ scope: { validateReplies: true } }).scope.validateReplies).toBe(true);
    expect(resolved({ scope: { validateReplies: false } }).scope.validateReplies).toBe(false);
  });

  it('`forces` sur une décoration : `null` → `blocking` et le retour', () => {
    const withForce = resolved({ decorations: { known: [{ id: 'urgent', forces: 'blocking' }] } });
    expect(withForce.decorations.known.find((d) => d.id === 'urgent')!.forces).toBe('blocking');
    const without = resolved({ decorations: { known: [{ id: 'urgent', forces: null }] } });
    expect(without.decorations.known.find((d) => d.id === 'urgent')!.forces).toBeNull();
  });

  it('avancer `activatedAt` prend effet, et le repousser aussi', () => {
    expect(resolved({ activation: { activatedAt: '2026-06-01T00:00:00Z' } }).activation.activatedAt).toBe('2026-06-01T00:00:00Z');
    expect(resolved({ activation: { activatedAt: '2026-12-01T00:00:00Z' } }).activation.activatedAt).toBe('2026-12-01T00:00:00Z');
  });

  it('`overrideLabel` suit le document courant', () => {
    // Épinglée autrefois : une PR ouverte gardait le nom d'étiquette de son ouverture.
    expect(resolved({ overrideLabel: 'nouvelle-etiquette' }).overrideLabel).toBe('nouvelle-etiquette');
  });
});

describe('CA-27, CA-31 — le plancher d’entreprise, en direct dans les deux sens', () => {
  it('CA-31 : durcir le plancher sur `mode` prend effet', () => {
    expect(resolved({ mode: 'warn' }, { minimumMode: 'enforce' }).mode).toBe('enforce');
  });

  it('CA-31 contre-épreuve : l’assouplir vaut tout aussi immédiatement', () => {
    // LE sens qu'un cliquet raterait — une implémentation qui n'appliquerait en direct que
    // les durcissements laisserait rouge une PR que la configuration courante accepte.
    expect(resolved({ mode: 'warn' }, { minimumMode: 'off' }).mode).toBe('warn');
  });

  it('CA-27 : revenir de `enforce` à `warn` au niveau organisation débloque', () => {
    // Le retour arrière du §6.3.3 : le document d'organisation repasse en `warn`, et le
    // vérificateur publie alors un statut jamais en échec (§6.2.2) — sans qu'on ait touché
    // à la protection de branche d'un seul dépôt.
    const enforcing = resolveConfig(null, found({ mode: 'enforce' }), absent).config;
    expect(enforcing.mode).toBe('enforce');
    const rolledBack = resolveConfig(null, found({ mode: 'warn' }), absent).config;
    expect(rolledBack.mode).toBe('warn');
  });

  it('le plancher durcit `activatedAt` en direct : la date la plus ancienne gagne (§8.1.1)', () => {
    const config = resolved(
      { activation: { activatedAt: '2026-09-01T00:00:00Z' } },
      { minimumMode: 'off', activation: { activatedAt: '2026-01-01T00:00:00Z' } }
    );
    expect(config.activation.activatedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('`configCacheTtlSeconds` et `docUrl` suivent le document', () => {
    const config = resolved({ configCacheTtlSeconds: 60, docUrl: 'https://doc.example/' });
    expect(config.configCacheTtlSeconds).toBe(60);
    expect(config.docUrl).toBe('https://doc.example/');
  });
});

describe('ce que la signature garantit, et qu’aucune assertion ne peut plus dire', () => {
  it('`resolveConfig` ne prend aucune entrée propre à une PR ni à un passé', () => {
    // Trois arguments : le plancher, le document d'organisation, le document de dépôt. Ni
    // configuration épinglée, ni drapeau « déjà évalué ». Une PR ouverte hier et une ouverte
    // à l'instant obtiennent donc la même configuration, parce qu'il n'existe aucun chemin
    // par lequel elles pourraient différer — c'est la forme du contrat qui le dit.
    expect(resolveConfig.length).toBe(3);
  });
});
