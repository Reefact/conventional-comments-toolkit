// Lecteur d'archives ZIP STOCKÉES, pour les tests : il relit ce que `zip()` écrit en partant de
// la FIN, comme un vrai lecteur — enregistrement de fin, répertoire central, puis en-têtes
// locaux —, et vérifie que les deux copies des métadonnées concordent et que chaque CRC est juste.
// Ce n'est pas une preuve d'interopérabilité (une lecture par un outil tiers l'est, voir
// zip.test.ts) ; c'est ce qui empêche une régression de passer inaperçue.

import { crc32 } from '../../src/options/zip.js';

export interface UnzippedFile {
  name: string;
  text: string;
  utf8Flag: boolean;
}

export function unzip(bytes: Uint8Array): UnzippedFile[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('enregistrement de fin absent');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files: UnzippedFile[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error(`entrée centrale ${i} absente`);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error(`${name} : méthode ${method}, attendu : stocké`);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`${name} : en-tête local absent`);
    if (view.getUint32(local + 14, true) !== crc) throw new Error(`${name} : CRC local et central divergent`);
    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra;
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`${name} : CRC faux`);
    files.push({ name, text: decoder.decode(data), utf8Flag: (flags & 0x0800) !== 0 });
    at += 46 + nameLength + extra + comment;
  }
  return files;
}
