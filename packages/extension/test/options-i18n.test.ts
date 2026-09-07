// @vitest-environment happy-dom
// La page d'options parle-t-elle la langue qu'on lui demande ? (§10, Internationalisation)
//
// Elle affichait du français en dur tout en proposant un réglage « Langue de l'interface »
// qu'elle n'appliquait qu'aux AUTRES écrans : on y choisissait `en`, l'extension parlait
// anglais sur les PR, et l'écran qui venait de recevoir le réglage restait français.

import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyStaticStrings, resolveLanguage } from '../src/options/i18n.js';
import { ui } from '../src/ui/strings.js';

// Chemin depuis la racine du dépôt, et non depuis `import.meta.url` : sous happy-dom,
// `import.meta.url` n'est pas une URL `file:` et `fileURLToPath` lève.
const OPTIONS_HTML = readFileSync(
  resolve(process.cwd(), 'packages/extension/src/options/options.html'),
  'utf8'
);

function mountRealPage(): void {
  const body = /<body>([\s\S]*)<\/body>/.exec(OPTIONS_HTML)?.[1] ?? '';
  document.body.innerHTML = body;
}

describe('résolution de la langue', () => {
  it('la préférence explicite l’emporte sur la langue du navigateur', () => {
    expect(resolveLanguage('en', 'fr-FR')).toBe('en');
    expect(resolveLanguage('fr', 'en-US')).toBe('fr');
  });

  it('sans préférence, la langue du navigateur décide — région comprise', () => {
    // `fr-CA`, `fr_FR`, `FR` : c'est la même langue, et le catalogue n'en connaît que la base.
    expect(resolveLanguage(null, 'fr-CA')).toBe('fr');
    expect(resolveLanguage('', 'fr_FR')).toBe('fr');
    expect(resolveLanguage(undefined, 'FR')).toBe('fr');
  });

  it('une langue qu’aucun catalogue ne connaît est IGNORÉE, pas servie', () => {
    // Servir `de` rendrait une page à moitié traduite : `ui()` se rabat clé par clé sur
    // l'anglais, donc l'utilisateur verrait de l'anglais en croyant avoir obtenu l'allemand.
    // La rejeter ici donne une page entièrement anglaise, ce qui est au moins cohérent.
    expect(resolveLanguage('de', 'de-DE')).toBe('en');
    // Mais une préférence inconnue ne doit pas emporter la langue du navigateur avec elle.
    expect(resolveLanguage('de', 'fr-FR')).toBe('fr');
  });

  it('sans rien du tout, l’anglais', () => {
    expect(resolveLanguage(null, null)).toBe('en');
    expect(resolveLanguage(42, {})).toBe('en');
  });
});

describe('application du catalogue à la vraie page', () => {
  beforeEach(() => mountRealPage());

  it('traduit les titres de section en anglais', () => {
    applyStaticStrings(document, 'en');
    expect(document.querySelector('[data-i18n="options.hosts.heading"]')?.textContent).toBe(
      'Allowed domains'
    );
    expect(document.querySelector('[data-i18n="options.telemetry.heading"]')?.textContent).toBe(
      'Telemetry'
    );
  });

  it('traduit aussi les ATTRIBUTS, pas seulement le texte', () => {
    // Un `aria-label` resté français sur une page anglaise ne se voit pas à l'œil : il ne
    // s'entend qu'au lecteur d'écran, ce qui est exactement la population qu'il sert.
    applyStaticStrings(document, 'en');
    expect(document.getElementById('host-input')?.getAttribute('aria-label')).toBe(
      ui('en', 'options.other.host.aria')
    );
    applyStaticStrings(document, 'fr');
    expect(document.getElementById('host-input')?.getAttribute('aria-label')).toBe(
      ui('fr', 'options.other.host.aria')
    );
  });

  it('déclare la langue sur <html>', () => {
    // Sans cet attribut, un lecteur d'écran prononce l'anglais avec la voix française : la
    // page est traduite et reste inécoutable.
    applyStaticStrings(document, 'en');
    expect(document.documentElement.lang).toBe('en');
    applyStaticStrings(document, 'fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('ne laisse AUCUN texte français dans la page passée en anglais', () => {
    // Le vrai test de la couverture : plutôt qu'énumérer les clés — une liste qui vieillit
    // et qu'on oublie d'étendre —, on cherche ce qui n'a pas pu être traduit. Les seules
    // chaînes admises sont celles qui ne se traduisent pas : noms de produits et exemples.
    applyStaticStrings(document, 'en');
    const text = document.body.textContent ?? '';
    for (const french of [
      'Domaines',
      'Réglages',
      'plateforme',
      'Autoriser',
      'Enregistrer',
      'Raccourcis',
      'Télémétrie',
    ]) {
      expect(text).not.toContain(french);
    }
  });

  it('les segments d’une phrase coupée par un <code> se traduisent tous les deux', () => {
    // Ces phrases sont découpées parce que le catalogue ne transporte pas de balisage. Le
    // risque du découpage est d'en oublier une moitié, qui reste alors dans l'autre langue
    // au milieu de la phrase.
    applyStaticStrings(document, 'en');
    const paragraph = document.querySelector('[data-i18n="options.other.sub.1"]')?.closest('p');
    expect(paragraph?.textContent).toContain(ui('en', 'options.other.sub.1'));
    expect(paragraph?.textContent).toContain(ui('en', 'options.other.sub.2'));
    expect(paragraph?.textContent).toContain('visualstudio.com');
  });
});
