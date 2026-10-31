// Une archive ZIP minimale, pour l'export du diagnostic de la page d'options (§9.4).
//
// Écrite ici plutôt que tirée d'une bibliothèque : l'extension n'a AUCUNE dépendance tierce à
// l'exécution, et ce dont l'export a besoin tient dans le sous-ensemble le plus simple du format
// (APPNOTE.TXT de PKWARE) — fichiers STOCKÉS sans compression (méthode 0), noms en UTF-8
// (bit 11), ni ZIP64, ni chiffrement, ni commentaire. Des fichiers texte de quelques centaines
// de kilo-octets au plus : rien n'y appelle ZIP64, dont le seuil est 4 Go.
//
// Pas de compression dans l'archive. Le format l'admettrait (deflate brut), mais pour quelques
// fichiers texte de quelques centaines de kilo-octets, joints à une issue, le gain ne justifie
// pas le chemin de plus — et un fichier stocké se vérifie octet pour octet.

export interface ZipEntry {
  /** Chemin dans l'archive, séparateur `/`. */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 du format ZIP (polynôme réfléchi 0xEDB88320). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS, en heure LOCALE comme le veut le format, à deux secondes
 * près. Avant 1980, le format n'a pas de représentation : 1980-01-01. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

export function zip(entries: readonly ZipEntry[], modified: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const stamp = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); // signature d'en-tête local
    l.setUint16(4, 20, true); // version nécessaire : 2.0
    l.setUint16(6, UTF8_FLAG, true);
    l.setUint16(8, 0, true); // méthode : stocké
    l.setUint16(10, stamp.time, true);
    l.setUint16(12, stamp.date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true); // taille compressée
    l.setUint32(22, size, true); // taille d'origine
    l.setUint16(26, name.length, true);
    l.setUint16(28, 0, true); // champ extra
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); // signature d'entrée du répertoire central
    c.setUint16(4, 20, true); // version qui a créé
    c.setUint16(6, 20, true); // version nécessaire
    c.setUint16(8, UTF8_FLAG, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, stamp.time, true);
    c.setUint16(14, stamp.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    // 30 extra, 32 commentaire, 34 disque, 36 attributs internes, 38 attributs externes : zéro.
    c.setUint32(42, offset, true); // position de l'en-tête local
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, part) => n + part.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); // fin du répertoire central
  e.setUint16(8, entries.length, true); // entrées sur ce disque
  e.setUint16(10, entries.length, true); // entrées au total
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true); // position du répertoire central

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
