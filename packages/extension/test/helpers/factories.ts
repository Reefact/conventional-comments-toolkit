// La table des fabriques d'adaptateurs pour les tests qui passent par `bootstrap()`.
//
// `bootstrap()` ne choisit plus d'adaptateur : il reçoit la table que le point d'entrée
// (`content.ts`) fournit en production. Les tests remplaçaient jusqu'ici le MODULE de
// l'adaptateur (`vi.doMock('@cct/adapter-github', …)`), parce que c'était le seul moyen de
// changer ce que le cœur construisait ; ils déclarent maintenant leur faux, et la table le sert.
//
// Une plateforme sans faux déclaré reçoit son VRAI adaptateur — ce que faisaient les tests qui
// ne mockaient rien.
import { AzdoClientAdapter } from '@cct/adapter-azdo';
import { GithubClientAdapter } from '@cct/adapter-github';
import type { ClientAdapterOptions, PlatformAdapter } from '@cct/adapter-shared';
import type { AdapterFactories } from '../../src/platforms.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapterClass = new (opts: any) => unknown;

const fakes = new Map<string, AnyAdapterClass>();

/** Sert `cls` à la place de l'adaptateur de la plateforme `id`, jusqu'à `clearFakeAdapters()`. */
export function fakeAdapter(id: string, cls: AnyAdapterClass): void {
  fakes.set(id, cls);
}

export function clearFakeAdapters(): void {
  fakes.clear();
}

/** La table : le faux déclaré s'il y en a un, l'adaptateur réel sinon — résolu à la
 * CONSTRUCTION, comme le faisait un module mocké. */
export function testFactories(): AdapterFactories {
  const make =
    (id: string, Real: AnyAdapterClass) =>
    (opts: ClientAdapterOptions): PlatformAdapter =>
      new (fakes.get(id) ?? Real)(opts) as PlatformAdapter;
  return { github: make('github', GithubClientAdapter), azdo: make('azdo', AzdoClientAdapter) };
}
