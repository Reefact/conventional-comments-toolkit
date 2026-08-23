// Point d'entrée exécutable du composant B : `node packages/server/dist/main.js`.
// Toute la configuration vient des variables d'environnement CCT_* (voir
// docs/deployment-fr.md) ; l'assemblage vit dans bootstrap.ts, testé sans écouter de port.

import { assembleFromEnv, resolvePort, BootstrapError, type AssembledServer } from './bootstrap.js';

const log = (m: string): void => console.log(`${new Date().toISOString()} ${m}`);

// Les gestionnaires de signaux s'installent AVANT tout travail : en conteneur, node est
// PID 1 et le noyau IGNORE les signaux d'un PID 1 sans gestionnaire — un arrêt demandé
// pendant le démarrage (lecture du stockage, premier balayage) finirait sinon en
// SIGKILL au bout du délai de l'orchestrateur d'infrastructure.
let assembled: AssembledServer | null = null;
let stopping = false;
function shutdown(signal: string): void {
  if (stopping) {
    // Second signal : sortie forcée — l'opérateur insiste, il ne faut plus attendre.
    log(`${signal} received again: forcing exit`);
    process.exit(130);
  }
  stopping = true;
  if (assembled === null) {
    log(`${signal} received during startup: exiting`);
    process.exit(0);
  }
  log(`${signal} received: draining evaluations and closing`);
  void assembled.stop().then(
    () => process.exit(0),
    (e) => {
      log(`shutdown error: ${String(e)}`);
      process.exit(1);
    }
  );
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => {
  log(`uncaught exception: ${String(e)}`);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  log(`unhandled rejection: ${String(e)}`);
  process.exit(1);
});

async function main(): Promise<void> {
  const port = resolvePort(process.env); // validé AVANT l'assemblage : échec net
  assembled = await assembleFromEnv(process.env, { log });
  if (stopping) return; // signal reçu pendant l'assemblage
  const bound = await assembled.start(port);
  log(
    `conventional-comments companion listening on :${bound} — platforms: ${assembled.platforms
      .map((p) => `${p.id} (${p.repos.length} repo(s) reconciled)`)
      .join(', ')}`
  );
}

main().catch((e) => {
  // Une erreur d'assemblage est une erreur de configuration : message net, sortie 1.
  console.error(e instanceof BootstrapError ? `configuration error: ${e.message}` : e);
  process.exit(1);
});
