// Point d'entrée exécutable du composant B : `node packages/server/dist/main.js`.
// Toute la configuration vient des variables d'environnement CCT_* (voir
// docs/deployment.md) ; l'assemblage vit dans bootstrap.ts, testé sans écouter de port.

import { assembleFromEnv, BootstrapError } from './bootstrap.js';

const log = (m: string): void => console.log(`${new Date().toISOString()} ${m}`);

async function main(): Promise<void> {
  const assembled = await assembleFromEnv(process.env, { log });
  const port = Number(process.env['CCT_PORT'] ?? '8080');
  const bound = await assembled.start(port);
  log(
    `conventional-comments companion listening on :${bound} — platforms: ${assembled.platforms
      .map((p) => `${p.id} (${p.repos.length} repo(s) reconciled)`)
      .join(', ')}`
  );

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received: draining evaluations and closing`);
    void assembled.stop().then(
      () => process.exit(0),
      (e) => {
        log(`shutdown error: ${String(e)}`);
        process.exit(1);
      }
    );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  // Une erreur d'assemblage est une erreur de configuration : message net, sortie 1.
  console.error(e instanceof BootstrapError ? `configuration error: ${e.message}` : e);
  process.exit(1);
});
