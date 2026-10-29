// Ce que le workflow d'exemple doit déclencher, et pourquoi.
//
// Le vérificateur est juste : `runOnce()` publie bien un statut informatif sur un
// brouillon, et `run.test.ts` le prouve. Mais un verdict juste qu'aucun événement ne
// réveille ne vaut rien — c'est le défaut qui a échappé ici, et il est invisible de tout
// test de `core/` ou de `packages/action/` : il vit dans un fichier YAML que personne
// n'exécute dans cette suite.
//
// La règle qui relie les deux : **toute entrée de `EvaluationInput` que la plateforme
// peut faire changer sans toucher au code doit avoir son déclencheur**. L'état brouillon
// en est une (§6.2.4), au même titre que les étiquettes (§6.3.2) et les commentaires.
// `ready_for_review` sans `converted_to_draft` ne couvre qu'un sens de la bascule : une PR
// passée en échec puis remise en brouillon gardait son rouge jusqu'au balayage planifié,
// alors que le §6.2.4 lui promet un statut informatif.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAIN = fileURLToPath(new URL('../docs/examples/conventional-comments.yml', import.meta.url));
const FORKS = fileURLToPath(
  new URL('../docs/examples/conventional-comments-forks.yml', import.meta.url)
);
const SWEEP = fileURLToPath(
  new URL('../docs/examples/conventional-comments-sweep.yml', import.meta.url)
);

/** Les types déclarés sous un déclencheur, lus dans le texte du fichier.
 *
 * Un vrai analyseur YAML serait plus propre et n'est pas dans les dépendances de ce dépôt.
 * Ce qu'on lit ici est une liste `[a, b, c]`, éventuellement repliée sur plusieurs lignes :
 * la reconnaître au texte suffit, et rate bruyamment plutôt qu'en silence — une forme
 * qu'elle ne reconnaît pas rend une liste vide, et chaque assertion ci-dessous échoue. */
function triggerTypes(yaml: string, trigger: string): string[] {
  const block = new RegExp(`^  ${trigger}:\\n([\\s\\S]*?)^  \\S`, 'm').exec(yaml + '\n  x');
  if (block === null) return [];
  const list = /types:\s*\n?\s*\[([^\]]*)\]/.exec(block[1]!);
  if (list === null) return [];
  return list[1]!
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** Les déclencheurs déclarés sous `on:`, et EUX SEULS — un `^  nom:` nu attraperait aussi
 * les noms de jobs, qui vivent à la même indentation sous `jobs:`. */
function triggers(yaml: string): string[] {
  const block = /^on:\n([\s\S]*?)^\S/m.exec(yaml);
  if (block === null) return [];
  return [...block[1]!.matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]!);
}

describe("déclencheurs du workflow d'exemple (§A.8)", () => {
  const main = readFileSync(MAIN, 'utf8');

  it('réveille le vérificateur sur les DEUX sens de la bascule brouillon (§6.2.4)', () => {
    const types = triggerTypes(main, 'pull_request_target');
    expect(types).toContain('ready_for_review');
    expect(types).toContain('converted_to_draft');
  });

  it("couvre les autres entrées que la plateforme change sans toucher au code", () => {
    const types = triggerTypes(main, 'pull_request_target');
    // L'étiquette d'exemption (§6.3.2), posée ou retirée, change le verdict.
    expect(types).toContain('labeled');
    expect(types).toContain('unlabeled');
    // Un push change le SHA de tête, que le §6.4 fait relire juste avant la publication.
    expect(types).toContain('synchronize');
    // L'ouverture et la réouverture : sans statut, une PR n'a rien à satisfaire.
    expect(types).toContain('opened');
    expect(types).toContain('reopened');
  });

  it('écoute la revue sous ses trois formes, édition et retrait compris', () => {
    // Une revue éditée ou retirée change les commentaires que le §3.5 valide, et une
    // suppression peut faire DISPARAÎTRE le seul fil bloquant : ne pas l'écouter laisse
    // un rouge qu'aucun événement ne lève.
    expect(triggerTypes(main, 'pull_request_review')).toEqual(
      expect.arrayContaining(['submitted', 'edited', 'dismissed'])
    );
    expect(triggerTypes(main, 'pull_request_review_comment')).toEqual(
      expect.arrayContaining(['created', 'edited', 'deleted'])
    );
    // La zone de conversation générale est validée elle aussi (§4.1).
    expect(triggerTypes(main, 'issue_comment')).toEqual(
      expect.arrayContaining(['created', 'edited', 'deleted'])
    );
  });

  it('déclare le MÊME groupe de concurrence dans les TROIS fichiers, au caractère près', () => {
    // Un groupe de concurrence est à l'échelle du dépôt : c'est cette identité qui
    // sérialise le balayage et le workflow compagnon avec le principal sur une même PR. Un
    // nom qui diverge d'un caractère rouvre la course sans rien signaler (§A.8).
    const groups = (yaml: string) =>
      [...yaml.matchAll(/^\s*group: (conventional-comments-.+)$/gm)].map((m) => m[1]!.trim());
    for (const file of [SWEEP, FORKS]) {
      expect(groups(readFileSync(file, 'utf8'))).toContain('conventional-comments-${{ matrix.pr }}');
    }
    expect(groups(main)).toContain(
      'conventional-comments-${{ github.event.pull_request.number || github.event.issue.number }}'
    );
  });
});

describe('le balayage a son PROPRE compteur d’exécutions (§A.8)', () => {
  const sweep = readFileSync(SWEEP, 'utf8');
  const main = readFileSync(MAIN, 'utf8');

  // CE QUE CE BLOC PROTÈGE, et il n'y a pas d'autre endroit où le faire. L'indice de
  // tranche vient de `GITHUB_RUN_NUMBER`, qui compte les exécutions DU WORKFLOW. Logé avec
  // les déclencheurs d'événements, il avancerait aussi à chaque commentaire, revue et
  // push — d'un pas souvent CONSTANT. Avec 512 PR (deux tranches) et une exécution
  // événementielle entre deux balayages, il avance de 2 : `runIndex % 2` ne change jamais
  // et la seconde tranche n'est JAMAIS évaluée, ce qui rouvre le trou silencieux que le
  // découpage ferme. Aucun test de `dispatchSlice()` ne peut voir ça : la propriété est
  // dans le fichier de workflow (revue Reefact, PR #90).

  it('ne se déclenche QUE sur l’horloge et la main, jamais sur un événement de PR', () => {
    expect(triggers(sweep).sort()).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('et le workflow principal ne balaie plus : sinon les deux compteurs se confondraient', () => {
    expect(triggers(main)).not.toContain('schedule');
    expect(triggers(main)).not.toContain('workflow_dispatch');
  });

  it('est le seul à employer le mode `dispatch` sur une énumération du dépôt', () => {
    // Le workflow compagnon emploie `dispatch` lui aussi, mais sur les PR d'une exécution
    // d'origine — jamais sur toutes les PR ouvertes, donc jamais sur une liste que la
    // limite de matrice borne. Lui seul et le balayage y recourent ; le principal, non.
    expect(sweep).toContain('mode: dispatch');
    expect(main).not.toContain('mode: dispatch');
  });
});
