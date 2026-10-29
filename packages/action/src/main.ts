// Point d'entrée de l'Action : il lit l'environnement que le runner pose, et rien d'autre.
// Aucun secret à configurer, aucun hôte à joindre que la plateforme elle-même (§A.8).
//
// Deux modes, et c'est la répartition du §6.4 qui les impose :
//
//   `evaluate` (défaut) — une PR, une évaluation, un statut. C'est ce que fait un
//     déclencheur qui désigne une PR, et ce que fait chaque job de la matrice.
//   `dispatch` — énumère les PR qu'un déclencheur couvre quand il en couvre plusieurs, et
//     NE PUBLIE AUCUN STATUT. Son seul effet est d'écrire la liste sur `GITHUB_OUTPUT`,
//     pour que le job suivant en fasse une matrice. Évaluer depuis ce job rouvrirait la
//     course que le groupe de concurrence par PR ferme (§A.8).
//
// Ce que ce fichier tient du runner. `GITHUB_REPOSITORY` et `GITHUB_OUTPUT` sont employés
// ailleurs dans ce dépôt (`.github/workflows/release.yml`), donc vérifiés ici même.
// `GITHUB_EVENT_PATH`, `GITHUB_API_URL`, `GITHUB_RUN_NUMBER` et la convention `INPUT_<NOM>`
// viennent du contrat documenté du runner et ne sont attestés par aucun fichier de ce
// dépôt : **à confirmer par une première exécution réelle**, au même titre que les deux
// mesures que le §A.8 réclame.

import { readFileSync, appendFileSync } from 'node:fs';
import { dispatchSlice, MATRIX_LIMIT } from './dispatch.js';
import { GithubVerifierAdapter } from './github.js';
import { runOnce } from './run.js';

/** Une entrée d'Action : `with: { floor-url: … }` arrive en `INPUT_FLOOR-URL`. */
function input(name: string): string | undefined {
  const raw = process.env[`INPUT_${name.toUpperCase()}`];
  return raw === undefined || raw.trim() === '' ? undefined : raw.trim();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — this is meant to run on a GitHub runner`);
  return value;
}

/** La charge de l'événement, ou `undefined` sur un déclencheur qui n'en dépose aucune. */
function readEvent(): unknown {
  const path = process.env['GITHUB_EVENT_PATH'];
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // Un événement illisible n'est pas une évaluation impossible : une PR injectée par la
    // matrice se passe entièrement de lui.
    return undefined;
  }
}

function setOutput(name: string, value: string): void {
  const file = process.env['GITHUB_OUTPUT'];
  if (!file) {
    // Hors runner — exécution locale de diagnostic : la sortie standard tient lieu de canal.
    process.stdout.write(`${name}=${value}\n`);
    return;
  }
  appendFileSync(file, `${name}=${value}\n`);
}

/** L'ordre des numéros de PR. `PrRef.number` est `number | string` — le contrat ne
 * suppose aucune plateforme (§9.2.1) —, et comparer des chaînes rangerait « 10 » avant
 * « 9 ». Sur GitHub ce sont toujours des entiers ; le repli lexical couvre le contrat. */
function byNumber(a: number | string, b: number | string): number {
  const [x, y] = [Number(a), Number(b)];
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Un indice qui AVANCE d'un BALAYAGE au suivant, pour faire tourner les tranches.
 *
 * `GITHUB_RUN_NUMBER` compte les exécutions DU WORKFLOW qui l'héberge, pas les balayages.
 * C'est la raison pour laquelle l'exemple met le balayage dans son propre fichier, déclenché
 * par la seule horloge : partagé avec les déclencheurs d'événements, ce compteur avancerait
 * aussi à chaque commentaire, chaque revue, chaque push, d'un pas souvent constant — avec
 * 512 PR (deux tranches) et une exécution événementielle entre deux passages, il avance de
 * 2, `runIndex % 2` ne change jamais, et la seconde tranche n'est jamais évaluée. Le
 * découpage rouvrirait alors le trou silencieux qu'il ferme (revue Reefact, PR #90).
 *
 * Ce fichier ne peut pas vérifier d'où vient son compteur, et ne le prétend pas : la
 * propriété tient au fichier de workflow, et c'est `tests/example-workflow.test.ts` qui la
 * contrôle.
 *
 * Hors runner, ou si la variable manquait, l'heure courante en tient lieu — elle avance
 * aussi. Rendre 0 serait le mauvais repli : la première tranche seule, indéfiniment, et la
 * queue jamais balayée. */
function runIndex(): number {
  const raw = Number(process.env['GITHUB_RUN_NUMBER']);
  if (Number.isFinite(raw)) return raw;
  return Math.floor(Date.now() / 1_800_000);
}

export async function main(): Promise<void> {
  const token = input('token') ?? requiredEnv('GITHUB_TOKEN');
  const repository = input('repository') ?? requiredEnv('GITHUB_REPOSITORY');
  const prNumber = input('pr-number');
  const adapter = new GithubVerifierAdapter({
    token,
    repository,
    ...(process.env['GITHUB_API_URL'] ? { apiBase: process.env['GITHUB_API_URL'] } : {}),
    ...(prNumber ? { prNumber: Number(prNumber) } : {}),
    ...(input('check-name') ? { checkName: input('check-name')! } : {}),
    event: readEvent(),
  });

  if ((input('mode') ?? 'evaluate') === 'dispatch') {
    const prs = await adapter.pullRequestsToDispatch();
    // Trié par numéro CROISSANT, et le sens compte. `dispatchSlice` veut un ordre stable
    // d'une exécution à l'autre ; l'API rend les PR par date de création décroissante, si
    // bien qu'une PR ouverte entre deux tours décalerait TOUTES les frontières de tranche.
    // En croissant, une nouvelle PR se range au bout : seule la dernière tranche bouge.
    const numbers = prs.map((pr) => pr.number).sort(byNumber);
    const slice = dispatchSlice(numbers, runIndex());
    // Une liste de numéros, telle que `fromJSON` la rend consommable par `strategy.matrix`.
    setOutput('prs', JSON.stringify(slice));
    setOutput('count', String(slice.length));
    setOutput('total', String(numbers.length));
    if (slice.length < numbers.length) {
      // Le journal du job porte ce que la troncature cache : une tranche muette serait
      // exactement le trou silencieux que la rotation existe pour éviter.
      console.log(
        `${numbers.length} PR ouvertes, plus que les ${MATRIX_LIMIT} d'une matrice : ` +
          `${slice.length} évaluées cette exécution (PR ${slice[0]} à ${slice[slice.length - 1]}), ` +
          `le reste aux exécutions suivantes.`
      );
    }
    return;
  }

  const outcome = await runOnce({ adapter, floorUrl: input('floor-url') ?? null });
  setOutput('state', outcome.result?.state ?? 'none');
  setOutput('published', String(outcome.published));
}

// `import.meta.url` vaut l'URL du module ; `process.argv[1]` le chemin du script lancé. Les
// comparer évite d'exécuter quoi que ce soit à l'import, ce que font les tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    // Le journal du job EST le diagnostic : une exception muette y laisserait un échec sans
    // cause lisible. Le code de sortie fait échouer l'étape, pas le check — celui-ci n'a
    // peut-être jamais été publié, et c'est précisément ce que le §6.4 admet ne pas couvrir.
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
