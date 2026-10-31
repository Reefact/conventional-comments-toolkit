// Les squelettes de page attachés aux lignes du journal (§9.4) : pris à l'INSTANT où une chaîne
// n'a rien trouvé, stockés compressés sous leur propre clé, exportés dans l'archive de
// diagnostic de la page d'options.
//
// L'instant est la raison d'être de cette donnée. Une capture faite à la main via F12 montre la
// page APRÈS coup, quand ce qui manquait a souvent fini par arriver : une boîte de fusion rendue
// après l'en-tête de la PR ne se voit sur aucune capture prise plus tard.
//
// LE BUDGET. `chrome.storage.local` est plafonné à 10 Mo depuis Chrome 114, à 5 Mo avant, et
// « Updates that would cause this limit to be exceeded fail immediately » (documentation de
// `chrome.storage`, lue le 2026-10-31) — TOUTES les écritures de l'extension, pas seulement
// celles-ci. Le manifeste ne déclare aucune version minimale de Chrome. Des diagnostics qui
// rempliraient le quota empêcheraient l'extension d'écrire le journal qu'ils servent à
// expliquer : d'où un budget fixe (`SKELETON_BUDGET`), les plus anciens évincés d'abord, et
// aucune écriture quand le quota manque de marge. Le squelette cède toujours, la ligne du
// journal jamais.
//
// Mesuré le 2026-10-31 sur les huit pages capturées de `adapters/github/test/fixtures/pages` :
// 200 Ko à 1,1 Mo de squelette brut, 20 à 60 Ko compressé. Le budget en garde donc une
// vingtaine. Les grosses PR n'ont pas été mesurées : `SKELETON_LIMITS` les borne.

export const SKELETON_KEY = 'journalSkeletons';

/** Taille totale, en caractères JSON — la mesure même du quota de `chrome.storage` —, de ce que
 * la clé des squelettes peut occuper. */
export const SKELETON_BUDGET = 1024 * 1024;

/** Part du quota au-delà de laquelle aucun squelette n'est plus écrit, budget ou non : le reste
 * de l'extension doit pouvoir écrire. */
export const QUOTA_HEADROOM = 0.8;

export interface StoredSkeleton {
  id: string;
  /** Instant du relevé. */
  at: string;
  /** Adresse de la page relevée, telle quelle — la même que celle de la ligne du journal. */
  url: string;
  /** Le squelette, compressé en gzip puis encodé en base64 : `chrome.storage` ne stocke que du
   * JSON. */
  gz: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** `null` quand le navigateur n'a pas `CompressionStream` : pas de squelette plutôt qu'un
 * squelette non compressé, qui ferait sauter le budget à lui seul. */
export async function compressSkeleton(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const gz = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
  return toBase64(gz);
}

export async function decompressSkeleton(gz: string): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const bytes = await pipe(fromBase64(gz), new DecompressionStream('gzip'));
    return new TextDecoder().decode(bytes);
  } catch {
    return null; // une valeur stockée abîmée : l'archive s'en passe
  }
}

/** Ajoute `next` et évince les plus anciens jusqu'à tenir dans `budget`. `null` : `next` seul
 * ne tient pas, rien n'est à écrire. */
export function fitSkeletons(
  existing: readonly StoredSkeleton[],
  next: StoredSkeleton,
  budget: number = SKELETON_BUDGET
): StoredSkeleton[] | null {
  if (JSON.stringify([next]).length > budget) return null;
  const kept = [...existing.filter((s) => s.id !== next.id), next];
  while (JSON.stringify(kept).length > budget) kept.shift();
  return kept;
}

export function newSkeletonId(now: number = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
