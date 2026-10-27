// Le REGISTRE des plateformes — la seule liste du code de l'extension qui les énumère.
//
// Tout ce qui, dans le code partagé, avait besoin de savoir « quelles plateformes existent » —
// la répartition des hôtes accordés, l'enregistrement des scripts, la page d'options, la marque
// de page du journal — itère cette liste et interroge la fiche de chacune (`PlatformDescriptor`).
// Ajouter une plateforme, c'est ajouter son paquet sous `packages/adapters/<id>` et une ligne
// ici ; `platform-registry.test.ts` refuse un dossier sans ligne, une ligne sans dossier, et une
// plateforme sans libellé ni entrée au schéma de politique.
//
// Les fiches viennent des sous-chemins `/descriptor` des paquets : elles ne contiennent aucun
// DOM, et ce module entre donc sans dommage dans le service worker et la page d'options
// (`check:bundle-isolation` vérifie qu'aucun adaptateur ne les y suit).

import type { PlatformDescriptor } from '@cct/adapter-shared';
import { azdoDescriptor } from '@cct/adapter-azdo/descriptor';
import { githubDescriptor } from '@cct/adapter-github/descriptor';

export const PLATFORMS = [githubDescriptor, azdoDescriptor] as const satisfies readonly PlatformDescriptor[];

/** L'identifiant d'une plateforme du registre. Dérivé des fiches : il n'existe aucune autre
 * liste à tenir à jour. */
export type PlatformId = (typeof PLATFORMS)[number]['id'];

export const PLATFORM_IDS: readonly PlatformId[] = PLATFORMS.map((p) => p.id);

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === 'string' && (PLATFORM_IDS as readonly string[]).includes(value);
}

/** Un tableau vide par plateforme — la forme d'une répartition d'hôtes où rien n'est accordé. */
export function emptyByPlatform(): Record<PlatformId, string[]> {
  return Object.fromEntries(PLATFORM_IDS.map((id) => [id, []])) as unknown as Record<PlatformId, string[]>;
}

/** Les `credentials` d'une lecture de configuration à cette URL, selon les fiches (§8.1.2,
 * relais du service worker). Une seule réponse compte : deux plateformes en désaccord sur la même
 * URL feraient dépendre la lecture de l'ORDRE du registre, le défaut que `selectPlatform()`
 * raconte. Aucune réponse, ou plus d'une : la règle commune, `include`. */
export function configCredentialsFor(
  url: string,
  descriptors: readonly Pick<PlatformDescriptor, 'configCredentials'>[] = PLATFORMS
): RequestCredentials {
  const answers = new Set(
    descriptors.map((d) => d.configCredentials(url)).filter((c): c is RequestCredentials => c !== null)
  );
  return answers.size === 1 ? [...answers][0]! : 'include';
}
