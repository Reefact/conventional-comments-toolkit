// Les icônes du manifeste sont une déclaration que seul le navigateur vérifie, et il le
// fait au pire moment : une taille annoncée dont le fichier manque, ou dont les
// dimensions ne correspondent pas, se solde par un chargement refusé ou une icône floue
// une fois l'extension publiée. Ces tests replacent la vérification avant le commit.
//
// Ils lisent le manifeste et les fichiers sur disque, sans navigateur : c'est
// exactement ce que Chrome et Firefox résolvent au chargement du bundle, dont
// `build.mjs` reproduit l'arborescence à l'identique depuis `src/`.

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8')) as {
  icons: Record<string, string>;
  action: { default_icon: Record<string, string>; default_title: string };
};

/** Dimensions déclarées par l'en-tête IHDR d'un PNG — les 8 octets de signature, puis
 * longueur et type de bloc, puis largeur et hauteur en big-endian. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex'), `${file} n’est pas un PNG`).toBe('89504e470d0a1a0a');
  expect(buf.subarray(12, 16).toString('ascii'), `${file} : premier bloc inattendu`).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('icônes de l’extension — manifeste et fichiers rendus', () => {
  it('les quatre tailles attendues par MV3 sont déclarées', () => {
    // 16 (barre d'outils), 32 (Windows), 48 (page de gestion), 128 (installation et
    // magasin) : les tailles que Chrome et Firefox demandent nommément.
    expect(Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48']);
  });

  it('chaque fichier déclaré existe et n’est pas vide', () => {
    for (const [size, path] of Object.entries(manifest.icons)) {
      const stat = statSync(join(SRC, path));
      expect(stat.isFile(), `${path} (taille ${size}) manquant`).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('chaque rendu mesure exactement la taille sous laquelle il est déclaré', () => {
    // Un 48 déclaré en 128 se voit à l'œil nu une fois installé, jamais avant.
    for (const [size, path] of Object.entries(manifest.icons)) {
      expect(pngSize(join(SRC, path)), `${path} déclaré en ${size}`).toEqual({
        width: Number(size),
        height: Number(size),
      });
    }
  });

  it('le bouton de la barre d’outils reprend exactement les icônes de l’extension', () => {
    // Deux jeux d'icônes qui divergent donnent une extension à deux visages : celui de
    // la barre d'outils et celui de la page de gestion.
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });

  it('le bouton de la barre d’outils annonce un titre au survol', () => {
    expect(manifest.action.default_title.trim().length).toBeGreaterThan(0);
  });
});
