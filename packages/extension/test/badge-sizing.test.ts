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

  it('le sujet posé sur la ligne des badges est effectivement en gras (demande Reefact)', () => {
    // Même défaut que celui décrit en tête de ce fichier, sur un autre nom de classe : badges.ts
    // pose `.cct-subject` autour du sujet, mais c'est CETTE règle — et elle seule — qui le met en
    // gras. Sans elle, le wrapper existe, les tests du DOM passent, et l'utilisateur ne voit
    // aucune différence avec ce qu'il a demandé de changer.
    const subjectWeight = declaredNumber(ruleBody('.cct-subject'), 'font-weight');
    expect(subjectWeight).toBeGreaterThan(400);
    // Même graisse que le badge de label qui ouvre la ligne : deux poids sur une même ligne
    // donneraient à croire à deux niveaux d'information là où il n'y en a qu'un.
    expect(subjectWeight).toBe(declaredNumber(ruleBody('.cct-badge-label'), 'font-weight'));
  });

  it('l’écart entre le dernier badge et le sujet vaut le DOUBLE de l’écart entre badges (demande Reefact)', () => {
    // Les deux marges s’additionnent — horizontales, elles ne fusionnent jamais —, si bien que
    // le sujet est à 2 × l’écart qui sépare deux badges. Écrire la même valeur des deux côtés
    // est ce qui rend le doublement EXACT plutôt qu’approché : un badge dont l’écart changerait
    // sans que celui-ci suive romprait la relation que cette règle exprime.
    const betweenBadges = declaredNumber(ruleBody('.cct-badge'), 'margin-right');
    const beforeSubject = declaredNumber(ruleBody('.cct-subject'), 'margin-left');
    expect(beforeSubject).toBe(betweenBadges);
  });

  it('la respiration sous la ligne du sujet est un BLOC de hauteur non nulle', () => {
    // Mesuré dans Chromium (spikes/subject-line.mjs) : une marge posée sur le `<br>` qui clôt la
    // ligne ne déplace rien, avec ou sans `display: block`. Seul un bloc à part, de hauteur
    // propre, écarte réellement le corps de la ligne du sujet — d’où ces deux déclarations,
    // dont aucune n’est décorative.
    const body = ruleBody('.cct-subject-break');
    expect(body).toMatch(/display\s*:\s*block/);
    expect(declaredNumber(body, 'height')).toBeGreaterThan(0);
  });
});
