// §8.1.1 — les deux canaux de plancher portent le MÊME document. Le canal du composant B
// est un fichier JSON libre (`CCT_FLOOR_FILE`) ; celui du composant A est une politique de
// navigateur, contrainte par `managed-schema.json`. Une clé absente de ce schéma n'est donc
// pas transportable côté extension, alors qu'elle l'est côté serveur : les deux
// configurations effectives divergent, leurs empreintes aussi, et la règle 2 du §8.1.3
// désarme le blocage d'envoi — en permanence, et sans que rien ne le signale.
//
// Ce garde a un intérêt propre, que la relecture ne remplace pas : le schéma avait dérivé
// silencieusement de sept clés. Il est construit pour ÉCHOUER À LA COMPILATION quand une
// clé est ajoutée à `Floor` sans être déclarée ici — `Required<Floor>` oblige à compléter
// l'objet ci-dessous, et l'assertion oblige alors à compléter le schéma.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Floor } from '@cct/core';

/** Toutes les clés de `Floor`, sans exception : `Required<>` interdit d'en omettre une.
 * Les valeurs n'ont aucune importance — seules les clés sont comparées. */
const everyFloorKey: Required<Floor> = {
  floorVersion: 1,
  configUrl: null,
  minimumMode: 'warn',
  formatSeverity: 'warn',
  severities: { 'E-NO-LABEL': 'error' },
  labels: { minimum: ['issue'] },
  rules: { minDecisionSubjectLength: 20 },
  activation: { activatedAt: '2026-09-01T00:00:00Z' },
  exemptUsers: { minimum: [], closed: false },
  allowlistPatterns: { minimum: [], closed: false },
  toolCommands: { minimum: [], closed: false },
  resolverOverrideGroup: [],
  configCacheTtlSeconds: 3600,
};

const schema = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/managed-schema.json', import.meta.url)), 'utf8')
) as { properties: { floor: { properties: Record<string, unknown> } } };

describe('§8.1.1 — le schéma de politique managée porte tout le document de plancher', () => {
  it('chaque clé de Floor est déclarée dans managed-schema.json', () => {
    const declared = Object.keys(schema.properties.floor.properties);
    const missing = Object.keys(everyFloorKey).filter((k) => !declared.includes(k));
    expect(missing).toEqual([]);
  });

  it('le schéma ne déclare aucune clé de plancher inconnue de Floor', () => {
    // Le sens inverse compte autant : une clé déclarée mais inexistante côté `core/` se
    // laisserait configurer par une politique d'entreprise sans effet, et sans avertir.
    const extra = Object.keys(schema.properties.floor.properties).filter(
      (k) => !Object.keys(everyFloorKey).includes(k)
    );
    expect(extra).toEqual([]);
  });
});

// ————— Contraintes de forme imposées par Chrome au schéma lui-même —————
// La doc « Manifest for managed storage » les énonce en trois points : le schéma de tête
// est un `object`, il ne porte pas d'`additionalProperties`, et **chaque schéma porte un
// `$ref` ou exactement un `type`**. Un `items` en `anyOf` (donc sans `type`) viole le
// troisième : Chrome peut alors rejeter `managed-schema.json`, et ne publier NI la clé
// fautive ni le reste de la politique de l'extension. C'est arrivé dans la PR #29, où
// `allowedHosts` acceptait deux formes via `anyOf` ; aucun test ne pouvait le voir, le
// JSON étant par ailleurs parfaitement valide.
//
// Ce garde vaut donc pour tout le fichier, pas pour la seule clé qui a fauté.

interface SchemaNode {
  type?: unknown;
  $ref?: unknown;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

/** Chemins de tous les nœuds de schéma qui ne portent ni `$ref` ni exactement un `type`. */
function nodesWithoutSingleType(node: SchemaNode, path = '(racine)'): string[] {
  const faults: string[] = [];
  const hasRef = typeof node.$ref === 'string';
  const hasOneType = typeof node.type === 'string';
  if (!hasRef && !hasOneType) faults.push(path);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    faults.push(...nodesWithoutSingleType(child, `${path}.${key}`));
  }
  if (node.items) faults.push(...nodesWithoutSingleType(node.items, `${path}[]`));
  return faults;
}

const wholeSchema = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/managed-schema.json', import.meta.url)), 'utf8')
) as SchemaNode & { additionalProperties?: unknown };

describe('contraintes de Chrome sur la forme du schéma de politique managée', () => {
  it('chaque schéma porte un $ref ou exactement un type — jamais anyOf/oneOf/allOf', () => {
    expect(nodesWithoutSingleType(wholeSchema)).toEqual([]);
  });

  it('le schéma de tête est un object, sans additionalProperties', () => {
    expect(wholeSchema.type).toBe('object');
    expect(wholeSchema.additionalProperties).toBeUndefined();
  });
});
