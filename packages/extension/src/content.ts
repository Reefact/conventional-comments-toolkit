// Point d'entrée du script de contenu (composant A), bundlé tel quel par
// packages/extension/build.mjs. Ne doit exporter STRICTEMENT rien : les content_scripts
// déclarés dans le manifest sont injectés par Chrome/Firefox comme des scripts
// classiques, pas des modules ES — un `export` en tête de bundle y casse le chargement
// avec « Unexpected token 'export' » (contrairement au service worker, qui déclare
// "type": "module" et tolère les exports). La logique testable vit dans
// content-internal.ts.

import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GithubClientAdapter } from '@cct/adapter-github';
import { bootstrap } from './content-internal.js';
import type { AdapterFactories } from './platforms.js';

/** Le POINT DE COMPOSITION du script de contenu : le seul fichier qui importe les adaptateurs,
 * et qui associe chacun à sa plateforme. L'absence de fabrique pour une plateforme enregistrée
 * provoque une erreur de compilation (`AdapterFactories`). Le cœur, `content-internal.ts`,
 * reçoit cette table et ne nomme aucune plateforme. */
const FACTORIES: AdapterFactories = {
  github: (opts) => new GithubClientAdapter(opts),
  azdo: (opts) => new AzdoClientAdapter(opts),
};

declare const chrome: { runtime?: unknown } | undefined;

/** Marqueur d'injection, posé dans le MONDE ISOLÉ du script de contenu — le même monde que
 * partagent l'enregistrement dynamique et `chrome.scripting.executeScript`, ce qui est
 * précisément ce qui le rend fiable ici.
 *
 * Il existe parce que le document a désormais DEUX chemins d'injection, et qu'un seul ne
 * suffisait pas : l'enregistrement dynamique n'atteint que les chargements SUIVANTS, mesuré
 * dans un vrai Chromium (`spikes/open-tab-injection.mjs`), donc le service worker injecte en
 * plus dans les onglets déjà ouverts au moment de l'octroi. Rien n'empêche les deux de viser
 * le même document — un onglet injecté à chaud puis rechargé, une reclassification d'un hôte
 * déjà servi —, et `bootstrap()` n'est pas idempotente : c'est le dédoublement de l'interface
 * qui avait motivé le passage à un enregistrement unique. Le garde est ici, sur le point
 * d'entrée, plutôt que côté worker : il tient quel que soit le chemin qui amène le script. */
const MARKER = '__cctContentScriptLoaded';

// Auto-exécution dans une page réelle (jamais sous test, où bootstrap() est appelée
// explicitement depuis content-internal.ts).
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome?.runtime) {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (!scope[MARKER]) {
    scope[MARKER] = true;
    void bootstrap(document, FACTORIES);
  }
}
