// @vitest-environment happy-dom
// §5.5 — le bandeau se place sous l'en-tête de la PR, sur CHAQUE capture, dans les trois vues.
//
// Les trois candidats d'avant (`pr-header`, `.gh-header-show`, `.gh-header`) ne trouvaient rien
// sur aucune capture : le bandeau tombait au repli, tout en haut du document, au-dessus de
// l'en-tête de GitHub. Fichier à part : analyser les 21 captures dans le même processus que les
// autres tests sur pages réelles épuisait la mémoire du fil de test.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GithubClientAdapter } from '../src/index.js';
import { PAGES, T } from './helpers/real-pages.js';

describe('§5.5 — le point d’insertion du bandeau', () => {
  it.each(readdirSync(PAGES).filter((f) => f.endsWith('.html')))('%s : l’en-tête qui porte le titre', (file) => {
    const doc = new DOMParser().parseFromString(readFileSync(join(PAGES, file), 'utf8'), 'text/html');
    const mount = new GithubClientAdapter({ documentRef: doc }).getBannerMount();
    expect(mount?.tagName).toBe('HEADER');
    expect(mount?.querySelector('h1')).not.toBeNull();
  }, T);
});
