// §8.1.1 — le plancher a un seul canal : la politique de navigateur, contrainte par
// `managed-schema.json`. Une clé absente de ce schéma n'est pas transportable : le plancher
// arriverait amputé, sans que rien ne le signale.
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
  minimumMode: 'assist',
  severities: { 'E-NO-LABEL': 'error' },
  labels: { minimum: ['issue'] },
  rules: { minDecisionSubjectLength: 20 },
  exemptUsers: { minimum: [], closed: false },
  allowlistPatterns: { minimum: [], closed: false },
  toolCommands: { minimum: [], closed: false },
  configCacheTtlSeconds: 3600,
};

/** CE QUE CHROME FAIT D'UN PLANCHER QUI NE SUIT PAS CE SCHÉMA — MESURÉ le 2026-11-11, Chrome for
 * Testing 153, politique `3rdparty` posée dans `/etc/opt/chrome_for_testing/policies/managed/`
 * (le répertoire que CE binaire lit : `/etc/chromium` et `/etc/opt/chrome` ne le sont pas, et une
 * première tentative qui y écrivait a conclu à tort que la politique n'arrivait jamais à une
 * extension chargée par `--load-extension` — elle mesurait le harnais). Lu dans
 * `chrome.storage.managed`, avec un schéma qui ne déclare plus les clés retirées :
 *
 *   - une clé IMBRIQUÉE non déclarée (`formatSeverity`, `activation`, `resolverOverrideGroup`)
 *     est écartée sans bruit, et le reste du plancher arrive intact ;
 *   - une VALEUR hors énumération (`minimumMode: "warn"`, `warn` retiré de l'énumération) fait
 *     écarter le plancher ENTIER : `floor` n'arrive pas du tout.
 *
 * D'où les deux règles ci-dessous. Les trois clés retirées avec le vérificateur (§2) ne sont plus
 * déclarées : elles n'avaient plus aucun effet, et Chrome les retire sans toucher au reste. `warn`,
 * lui, reste déclaré : l'en retirer ferait disparaître en silence tout le plancher d'une
 * organisation qui l'écrit encore, là où le §7 le lit comme `assist`. */

const schema = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/managed-schema.json', import.meta.url)), 'utf8')
) as { properties: { floor: { properties: Record<string, unknown> } } };

describe('§8.1.1 — le schéma de politique managée porte tout le document de plancher', () => {
  it('chaque clé de Floor est déclarée dans managed-schema.json', () => {
    const declared = Object.keys(schema.properties.floor.properties);
    const missing = Object.keys(everyFloorKey).filter((k) => !declared.includes(k));
    expect(missing).toEqual([]);
  });

  it('le schéma ne déclare aucune clé hors de Floor — pas même les clés retirées', () => {
    // Le sens inverse compte autant : une clé déclarée mais inexistante côté `core/` se
    // laisserait configurer par une politique d'entreprise sans effet. Les clés retirées avec le
    // vérificateur (§2) en étaient l'exception, le temps de mesurer ce que Chrome ferait d'un
    // plancher qui les porte encore : il les écarte, sans toucher au reste (en-tête ci-dessus).
    const extra = Object.keys(schema.properties.floor.properties).filter(
      (k) => !Object.keys(everyFloorKey).includes(k)
    );
    expect(extra).toEqual([]);
  });

  it('`warn` reste dans l’énumération de `minimumMode` : il est lu comme `assist` (§7)', () => {
    // L'en retirer fait écarter par Chrome TOUT le plancher qui l'écrit encore (mesuré, en-tête
    // ci-dessus), au lieu de le laisser lire comme `assist` et signaler.
    const minimumMode = schema.properties.floor.properties['minimumMode'] as { enum: string[] };
    expect(minimumMode.enum).toContain('warn');
  });
});

// ————— La télémétrie n'est activable QUE par ce canal (§10) —————
// Une clé absente du schéma n'arrive jamais : Chrome la retire du stockage managé sans rien
// dire. Le point de collecte ayant été déplacé vers ce canal pour qu'aucun dépôt ne puisse
// choisir la destination de ses données, la déclaration oubliée rendait la fonctionnalité
// entière inerte en production — case grisée, aucun compteur, aucune erreur (revue Codex,
// PR #31). `npm run check:managed-keys` confronte les LECTURES du code à ce schéma ; ce
// test-ci fixe la forme attendue des deux champs.

describe('§10 — le canal de politique transporte la déclaration de télémétrie', () => {
  const telemetry = (
    JSON.parse(
      readFileSync(fileURLToPath(new URL('../src/managed-schema.json', import.meta.url)), 'utf8')
    ) as { properties: Record<string, { type?: string; properties?: Record<string, { type?: string }> }> }
  ).properties['telemetry'];

  it('déclare `telemetry.enabled` (booléen) et `telemetry.endpoint` (chaîne)', () => {
    expect(telemetry?.type).toBe('object');
    expect(telemetry?.properties?.['enabled']?.type).toBe('boolean');
    expect(telemetry?.properties?.['endpoint']?.type).toBe('string');
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
