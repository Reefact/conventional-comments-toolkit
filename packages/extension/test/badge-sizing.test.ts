// Taille des badges (§5.5) : le badge de LABEL doit rester visuellement plus marquant que les
// badges de DÉCORATION qui le suivent — plus grand ET en semi-gras — comme le donne à voir le
// mockup de référence (docs/badges-decoration-mockup.html, .badge-label vs .badge-deco). Un
// premier écart réel entre les deux a existé en production : `.cct-badge-label` n'était qu'un
// nom de classe posé par labelBadge() sans la moindre règle CSS propre, si bien que le label
// n'héritait que du gabarit neutre de `.cct-badge` (à peine 1px de plus qu'une décoration,
// jamais en gras) — la mise en avant que le mockup montre n'existait pas dans le rendu livré.
//
// Lecture TEXTUELLE de styles.css, pas d'injection dans un `<style>` happy-dom : même technique
// que banner.test.ts, qui évite de dépendre de la résolution de `getComputedStyle` sur des
// propriétés raccourcies (`padding`), peu fiable hors d'un vrai navigateur.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'packages/extension/src/styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  ' '
);

function ruleBody(selector: string): string {
  const re = new RegExp(selector.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}');
  const m = re.exec(css);
  if (!m) throw new Error(`règle ${selector} introuvable dans styles.css`);
  return m[1]!;
}

/** Valeur numérique d'une déclaration, avec ou sans unité — `font-size` s'écrit en `px`,
 * `font-weight` est un entier nu (600, 400), sans quoi la même expression pour les deux
 * chercherait un « px » que `font-weight` ne porte jamais et échouerait à tort. */
function declaredNumber(body: string, property: string): number {
  const m = new RegExp(`${property}\\s*:\\s*([\\d.]+)`).exec(body);
  if (!m) throw new Error(`propriété ${property} absente de la règle : ${body}`);
  return Number(m[1]);
}

describe('taille des badges (§5.5) — le label reste plus marquant que ses décorations', () => {
  it('le badge de label est un texte strictement plus grand que le badge de décoration', () => {
    const labelSize = declaredNumber(ruleBody('.cct-badge-label'), 'font-size');
    const decoSize = declaredNumber(ruleBody('.cct-badge-deco'), 'font-size');
    expect(labelSize).toBeGreaterThan(decoSize);
  });

  it('le badge de label est en semi-gras, la décoration jamais (revue Reefact — masquage du préfixe, PR #40)', () => {
    const labelWeight = declaredNumber(ruleBody('.cct-badge-label'), 'font-weight');
    const decoWeight = declaredNumber(ruleBody('.cct-badge-deco'), 'font-weight');
    expect(labelWeight).toBeGreaterThan(decoWeight);
    expect(decoWeight).toBeLessThanOrEqual(400); // jamais en gras, cf. commentaire au-dessus de .cct-badge-deco
  });
});
