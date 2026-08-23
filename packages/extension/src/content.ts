// Point d'entrée du script de contenu (composant A), bundlé tel quel par
// packages/extension/build.mjs. Ne doit exporter STRICTEMENT rien : les content_scripts
// déclarés dans le manifest sont injectés par Chrome/Firefox comme des scripts
// classiques, pas des modules ES — un `export` en tête de bundle y casse le chargement
// avec « Unexpected token 'export' » (contrairement au service worker, qui déclare
// "type": "module" et tolère les exports). La logique testable vit dans
// content-internal.ts.

import { bootstrap } from './content-internal.js';

declare const chrome: { runtime?: unknown } | undefined;

// Auto-exécution dans une page réelle (jamais sous test, où bootstrap() est appelée
// explicitement depuis content-internal.ts).
if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome?.runtime) {
  void bootstrap();
}
