// Le workflow de release documente les tags de pré-version (`v1.1.0-rc.1`) : la version
// annoncée par le tag et celle que porte `manifest.json` ne sont alors pas la même chose,
// et les confondre casse la livraison des deux côtés — soit la garde refuse un tag
// légitime, soit elle laisse publier une archive que Chromium refuse de charger.
import { describe, expect, it } from 'vitest';

// @ts-expect-error — script d'outillage en JavaScript simple, sans déclarations de types.
import { isChromiumVersion, resolveRelease } from '../scripts/release-version.mjs';

describe("forme de version acceptée par un manifeste d'extension", () => {
  it('accepte un à quatre entiers de 0 à 65535', () => {
    expect(isChromiumVersion('1')).toBe(true);
    expect(isChromiumVersion('1.0.0')).toBe(true);
    expect(isChromiumVersion('1.2.3.4')).toBe(true);
    expect(isChromiumVersion('0.0.65535')).toBe(true);
  });

  it('refuse ce que Chromium refuse', () => {
    expect(isChromiumVersion('1.0.0-rc.1')).toBe(false); // étiquette de pré-version
    expect(isChromiumVersion('1.2.3.4.5')).toBe(false); // cinq composants
    expect(isChromiumVersion('1.65536')).toBe(false); // hors borne
    expect(isChromiumVersion('01.0')).toBe(false); // zéro non significatif
    expect(isChromiumVersion('')).toBe(false);
  });
});

describe('résolution de la version publiée', () => {
  it('nomme les archives depuis le tag quand il correspond au manifeste', () => {
    const resolved = resolveRelease({ manifestVersion: '1.2.0', tag: 'v1.2.0' });
    expect(resolved).toMatchObject({ version: '1.2.0', core: '1.2.0', prerelease: false });
    expect(resolved.chromium).toBe('conventional-comments-toolkit-1.2.0-chromium.zip');
    expect(resolved.firefox).toBe('conventional-comments-toolkit-1.2.0-firefox.zip');
  });

  it("compare le noyau numérique du tag, et laisse l'étiquette de pré-version au nommage", () => {
    const resolved = resolveRelease({ manifestVersion: '1.1.0', tag: 'v1.1.0-rc.1' });
    expect(resolved.core).toBe('1.1.0'); // ce que le manifeste doit déclarer
    expect(resolved.version).toBe('1.1.0-rc.1'); // ce que la Release annonce
    expect(resolved.prerelease).toBe(true);
    expect(resolved.chromium).toBe('conventional-comments-toolkit-1.1.0-rc.1-chromium.zip');
  });

  it('refuse un manifeste portant une étiquette de pré-version — Chromium ne le chargerait pas', () => {
    expect(() => resolveRelease({ manifestVersion: '1.1.0-rc.1', tag: 'v1.1.0-rc.1' })).toThrow(
      /version d'extension valide/,
    );
  });

  it('refuse un tag qui annonce une autre version que le manifeste', () => {
    expect(() => resolveRelease({ manifestVersion: '1.0.0', tag: 'v9.9.9' })).toThrow(/le manifeste déclare 1\.0\.0/);
  });

  it("refuse un tag qui n'a pas la forme attendue", () => {
    expect(() => resolveRelease({ manifestVersion: '1.0.0', tag: 'release-1.0.0' })).toThrow(/forme attendue/);
    expect(() => resolveRelease({ manifestVersion: '1.0.0', tag: 'v1.0.0-' })).toThrow(/forme attendue/);
  });

  it('sans tag, la répétition à blanc se nomme depuis le manifeste et ne publie rien', () => {
    const resolved = resolveRelease({ manifestVersion: '1.0.0' });
    expect(resolved.tag).toBe('');
    expect(resolved.version).toBe('1.0.0');
    expect(resolved.prerelease).toBe(false);
  });
});
