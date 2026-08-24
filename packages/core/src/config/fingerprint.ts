// Empreinte de configuration (§9.2.2). Domaine clos : n'y entrent que les clés qui
// gouvernent le verdict ET que les deux composants résolvent. Toute autre clé est exclue,
// sans exception — une clé hors liste ne doit jamais faire diverger l'empreinte.

import type { EffectiveConfig } from '../types.js';

interface FingerprintDomain {
  mode: string;
  formatSeverity: string;
  severities: [string, string][];
  labels: {
    id: string;
    enabled: boolean;
    blockingByDefault: boolean;
    alwaysNonBlocking: boolean;
    aliases: string[];
  }[];
  decorations: { allowFree: boolean; known: { id: string; forces: string | null }[] };
  rules: { minSubjectLength: number; maxSubjectLength: number; minDecisionSubjectLength: number };
  scope: { validateReplies: boolean; validateReviewSummary: boolean };
  exemptUsers: string[];
  allowlistPatterns: string[];
  /** OPTIONNEL, et c'est la condition de compatibilité — voir `fingerprintDomain()`. */
  toolCommands?: string[];
  activatedAt: string | null;
}

/** Projection canonique et déterministe : listes triées là où l'ordre est indifférent. */
export function fingerprintDomain(config: EffectiveConfig): FingerprintDomain {
  return {
    mode: config.mode,
    formatSeverity: config.formatSeverity,
    // Une surcharge égale à la sévérité du tableau §3.5.2 ne change aucun verdict : elle
    // est écartée, pour que deux configurations sémantiquement identiques produisent la
    // même empreinte (§8.1.3, règle 2 — jamais de désaccord fabriqué).
    severities: Object.entries(config.severities)
      .filter(([code, sev]) => sev !== (code.startsWith('E-') ? 'error' : 'warn'))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
    labels: [...config.labels]
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((l) => ({
        id: l.id,
        enabled: l.enabled,
        blockingByDefault: l.blockingByDefault,
        alwaysNonBlocking: l.alwaysNonBlocking,
        aliases: [...l.aliases].sort(),
      })),
    decorations: {
      allowFree: config.decorations.allowFree,
      known: [...config.decorations.known]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((d) => ({ id: d.id, forces: d.forces })),
    },
    rules: {
      minSubjectLength: config.rules.minSubjectLength,
      maxSubjectLength: config.rules.maxSubjectLength,
      minDecisionSubjectLength: config.rules.minDecisionSubjectLength,
    },
    scope: {
      validateReplies: config.scope.validateReplies,
      validateReviewSummary: config.scope.validateReviewSummary,
    },
    // ————— Les deux membres à comparaison insensible à la casse (§4.2) —————
    // `exemptUsers` compare `UserInfo.login` sans égard à la casse, `toolCommands` compare
    // les mentions de la même façon : leur projection doit l'être aussi, sans quoi `@Codex`
    // et `@codex` — qui exemptent exactement les mêmes commentaires — produiraient deux
    // empreintes.
    //
    // DÉDOUBLONNÉS après normalisation, et pas seulement normalisés : le dédoublonnage ne
    // découle pas de la normalisation. L'union du §8.1.4 et le mélange du §8.1.3 comparent
    // au caractère près, si bien qu'une correction de casse sur une PR déjà épinglée laisse
    // les DEUX orthographes dans la configuration mélangée. Sans ces `Set`, le serveur
    // projetterait deux entrées là où l'extension n'en projette qu'une, et la règle 2 du
    // §8.1.3 désarmerait le blocage d'envoi sur un désaccord fabriqué.
    exemptUsers: [...new Set(config.exemptUsers.map((u) => u.toLowerCase()))].sort(),
    //
    // CE DÉDOUBLONNAGE OUVRE UNE FENÊTRE DE DÉCALAGE, et il faut la connaître : une
    // organisation déclarant `Dependabot[bot]` et un dépôt déclarant `dependabot[bot]`
    // donnent, chez les DEUX composants, une liste résolue à deux entrées — `mergeLevel()`
    // unit au caractère près. L'ancienne projection en produisait deux (`42f3097d`), la
    // nouvelle une (`3c5793aa`) : tant qu'un seul des deux composants est à jour, ils
    // divergent alors qu'ils exemptent la même chose.
    //
    // La fenêtre est inévitable pour toute correction de cette classe — dédoublonner dans
    // `mergeLevel()` plutôt qu'ici produirait exactement le même écart —, et elle est
    // transitoire : la règle 5 du §8.1.3 déclare le décalage NORMAL, et le désarmement du
    // blocage d'envoi qu'il provoque va dans le sens sûr. Sans le dédoublonnage, le
    // désaccord serait au contraire PERMANENT et sur une même version, ce que le principe
    // de ce fichier interdit — « jamais de désaccord fabriqué ». Le §9.2.2 tranche dans ce
    // sens, et c'est lui qui fait foi.
    // OMIS QUAND LA LISTE EST VIDE, et ce n'est pas une micro-optimisation : c'est ce qui
    // rend l'ajout de la clé compatible avec la version précédente de `core/`.
    //
    // L'entrée de `fingerprint()` est un objet sérialisé en JSON : un membre présent avec
    // `[]` ne produit PAS le même texte qu'un membre absent. Sans cette omission, un dépôt
    // qui ne configure RIEN verrait son empreinte changer du seul fait de la mise à jour —
    // mesuré : `f3c2a515` contre `becd76df`. Pendant toute la fenêtre de décalage entre
    // l'extension et le serveur, que la règle 5 du §8.1.3 déclare NORMALE, la règle 2
    // prendrait ce simple écart de version pour un désaccord de configuration et
    // désarmerait le blocage d'envoi sur **tous** les dépôts — y compris ceux qui n'ont
    // jamais entendu parler de cette clé.
    //
    // Une liste vide et une clé absente exemptent exactement la même chose : rien. Les
    // confondre dans la projection est donc juste, et pas seulement commode. Même
    // précaution que sur `severities`, dont une surcharge égale au défaut du §3.5.2 n'est
    // pas matérialisée, et pour exactement la même raison.
    ...(config.toolCommands.length > 0
      ? { toolCommands: [...new Set(config.toolCommands.map((c) => c.toLowerCase()))].sort() }
      : {}),
    // `allowlistPatterns` n'est PAS dans ce cas : la comparaison y est sensible à la casse
    // — un motif est une expression régulière, pas un identifiant —, et l'union du §8.1.4
    // écarte déjà les doublons exacts. Rien à dédoublonner qui puisse naître.
    allowlistPatterns: [...config.allowlistPatterns].sort(),
    activatedAt: config.activation.activatedAt,
  };
}

/** FNV-1a 32 bits, en hexadécimal sur 8 caractères — borné, comme tous les champs de la
 * ligne cc/1 (§6.3.1). L'entrée est la configuration effective, jamais le texte des
 * fichiers dont elle est issue (§9.2.2). */
export function fingerprint(config: EffectiveConfig): string {
  const json = JSON.stringify(fingerprintDomain(config));
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
