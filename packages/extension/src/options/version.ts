/** La version à afficher : `version_name` d'abord, puisque c'est elle qui porte l'étiquette de
 * pré-version (`1.0.0-beta.15`) que `version` ne peut pas déclarer — sans elle, deux bêtas
 * s'afficheraient toutes deux « 1.0.0 ». Firefox ne connaît pas `version_name` (le build la
 * retire de sa variante) : il retombe sur `version`. Rend null si rien n'est lisible. */
export function displayVersion(
  manifest: { version?: string; version_name?: string } | undefined
): string | null {
  const name = manifest?.version_name?.trim() || manifest?.version?.trim();
  return name ? `v${name}` : null;
}
