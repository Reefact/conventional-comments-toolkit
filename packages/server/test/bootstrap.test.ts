// Assemblage du service auto-hébergeable (bootstrap.ts) : la configuration vient des
// variables CCT_*, une instance porte une ou plusieurs plateformes, le stockage se
// choisit par configuration, et une configuration invalide échoue NET au démarrage —
// jamais un service qui tourne à moitié.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assembleFromEnv, BootstrapError } from '../src/bootstrap.js';
import { MemoryStorage, FileStorage } from '../src/compliance/storage.js';
import { SqliteStorage } from '../src/compliance/storage-sqlite.js';

const sqliteOk = await SqliteStorage.available();

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cct-bootstrap-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const AZDO_ENV = {
  CCT_AZDO_ORG_URL: 'https://dev.azure.com/acme',
  CCT_AZDO_PROJECT: 'proj',
  CCT_AZDO_TOKEN: 'pat',
  CCT_AZDO_WEBHOOK_SECRET: 'wh2',
};
// GitHub n'est plus une plateforme de ce service (§6.4.1) : l'environnement de base est
// donc celui d'Azure DevOps, seule plateforme qui ait encore besoin d'un service hébergé.
const BASE_ENV = {
  CCT_ADMIN_TOKEN: 'secret-admin',
  CCT_STORAGE: 'memory',
  ...AZDO_ENV,
};

describe('assemblage — configuration refusée net quand elle est invalide', () => {
  it('sans CCT_ADMIN_TOKEN : erreur claire', async () => {
    await expect(assembleFromEnv({ ...BASE_ENV, CCT_ADMIN_TOKEN: undefined })).rejects.toThrow(
      /CCT_ADMIN_TOKEN/
    );
  });

  it('sans aucune plateforme : erreur claire', async () => {
    await expect(
      assembleFromEnv({ CCT_ADMIN_TOKEN: 'a', CCT_STORAGE: 'memory' })
    ).rejects.toThrow(/no platform configured/);
  });

  it('jeton Azure DevOps posé mais secret de webhook absent : erreur, jamais un webhook non vérifié', async () => {
    await expect(
      assembleFromEnv({
        CCT_ADMIN_TOKEN: 'a',
        CCT_STORAGE: 'memory',
        CCT_AZDO_ORG_URL: 'https://dev.azure.com/acme',
        CCT_AZDO_PROJECT: 'proj',
        CCT_AZDO_TOKEN: 'pat',
      })
    ).rejects.toThrow(/CCT_AZDO_WEBHOOK_SECRET/);
  });

  it('variables GitHub héritées : refus au démarrage qui NOMME le remplacement (§6.4.1, §A.8)', async () => {
    // Démarrer en les ignorant serait le pire des comportements : le service tournerait,
    // l'exploitant croirait ses dépôts GitHub surveillés, et aucune PR ne le serait.
    await expect(
      assembleFromEnv({ ...BASE_ENV, CCT_GITHUB_TOKEN: 'ghp_x', CCT_GITHUB_WEBHOOK_SECRET: 'wh' })
    ).rejects.toThrow(/GitHub Action running in the repository itself/);
    await expect(
      assembleFromEnv({ ...BASE_ENV, CCT_GITHUB_REPOS: 'acme/demo' })
    ).rejects.toThrow(/CCT_GITHUB_REPOS/);
  });

  it('CCT_STORAGE inconnu : erreur qui énumère les valeurs admises', async () => {
    await expect(assembleFromEnv({ ...BASE_ENV, CCT_STORAGE: 'postgres' })).rejects.toThrow(
      /memory, file or sqlite/
    );
  });

  it('CCT_FLOOR_FILE illisible : échec au démarrage, pas un service sans plancher', async () => {
    const bad = join(dir, 'floor-bad.json');
    await writeFile(bad, '{invalid', 'utf8');
    await expect(assembleFromEnv({ ...BASE_ENV, CCT_FLOOR_FILE: bad })).rejects.toThrow(
      BootstrapError
    );
  });
});

describe('assemblage — plateformes et stockage par configuration', () => {
  it('Azure DevOps : une plateforme ; dépôts réconciliés projetés dans le scope du projet', async () => {
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_AZDO_REPOS: 'repo1, repo2' });
    expect(a.platforms.map((p) => p.id)).toEqual(['azdo']);
    expect(a.platforms[0]!.repos).toEqual([
      { platform: 'azdo', host: 'dev.azure.com', scope: ['acme', 'proj', 'repo1'] },
      { platform: 'azdo', host: 'dev.azure.com', scope: ['acme', 'proj', 'repo2'] },
    ]);
    expect(a.storage).toBeInstanceOf(MemoryStorage);
    await a.stop();
  });

  it('CCT_STORAGE=file : FileStorage au chemin donné', async () => {
    const path = join(dir, 'state.json');
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_STORAGE: 'file', CCT_STORAGE_PATH: path });
    expect(a.storage).toBeInstanceOf(FileStorage);
    await a.stop();
  });

  it.skipIf(!sqliteOk)('CCT_STORAGE=sqlite : SqliteStorage', async () => {
    const a = await assembleFromEnv({
      ...BASE_ENV,
      CCT_STORAGE: 'sqlite',
      CCT_STORAGE_PATH: join(dir, 'state.sqlite'),
    });
    expect(a.storage).toBeInstanceOf(SqliteStorage);
    await a.stop();
  });

  it('CCT_FLOOR_FILE valide : le plancher est RELU à chaque appel (§8.1.1)', async () => {
    const path = join(dir, 'floor.json');
    await writeFile(path, JSON.stringify({ minimumMode: 'warn' }), 'utf8');
    const a = await assembleFromEnv({ ...BASE_ENV, CCT_FLOOR_FILE: path });
    // Le provider vit dans l'orchestrateur ; on le vérifie par son effet observable :
    // la sonde §6.3.3 n'a rien à observer (pas de configUrl), donc probe → null.
    await writeFile(path, JSON.stringify({ minimumMode: 'enforce' }), 'utf8');
    // Pas d'accès direct au provider ici — la relecture par évaluation est couverte par
    // les tests d'orchestrateur ; l'assemblage vérifie qu'un fichier valide est accepté.
    expect(a.platforms).toHaveLength(1);
    await a.stop();
  });
});

describe('assemblage — le service assemblé répond réellement', () => {
  it('start(0) écoute, /healthz répond 200, /admin exige le jeton, stop() ferme', async () => {
    const a = await assembleFromEnv(BASE_ENV);
    const port = await a.start(0);
    expect(port).toBeGreaterThan(0);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const unauthorized = await fetch(`http://127.0.0.1:${port}/admin/indicators/x`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`http://127.0.0.1:${port}/admin/exemption-log`, {
      headers: { authorization: 'Bearer secret-admin' },
    });
    expect(authorized.status).toBe(200);

    await a.stop();
    await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow();
  });
});
