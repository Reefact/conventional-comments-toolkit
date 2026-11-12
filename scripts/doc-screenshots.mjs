// Images de la documentation (README, docs/guide) : la barre d'outils, la pastille et les badges
// tels que le code LIVRÉ les rend — `buildToolbar`, `FeedbackView`, `decorateComment`,
// `styles.css` et la feuille de GitHub —, dans un vrai Chromium.
//
// CE QUE CES IMAGES NE SONT PAS, et que leur légende doit dire : des captures de github.com.
// La page qui porte les composants est une page de test ; ses couleurs sont les valeurs du
// thème clair de GitHub recopiées ici à la main, et les cartes qui encadrent les commentaires
// sont un décor. Seuls les composants de l'extension sont ceux du produit.
//
// Le câblage est rejoué, pas appelé : le contrôleur ne se monte pas sans adaptateur ni
// configuration résolue. Ce script montre un rendu, il ne vérifie rien — aucun garde.
//
// Usage : npm run docs:screenshots     (écrit docs/images/*-en.png et *-fr.png)
//         `npm run build` d'abord : les paquets `@cct/*` sont consommés compilés.

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/images');
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? chromium.executablePath();

if (!existsSync(EXECUTABLE)) {
  console.error(`Chromium introuvable : ${EXECUTABLE}\nUne fois par machine :  npx playwright-core install chromium`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const bundled = await build({
  stdin: {
    contents: `
      import { buildToolbar } from './packages/extension/src/ui/toolbar.ts';
      import { FeedbackView } from './packages/extension/src/ui/feedback.ts';
      import { feedbackState } from './packages/extension/src/guard.ts';
      import { decorateComment } from './packages/extension/src/ui/badges.ts';
      import { GITHUB_BODY_SHAPE } from '@cct/adapter-github';
      import { analyze, defaultConfig, splitBody, matchPrefix, resolveLabel, parseDecorations } from '@cct/core';
      globalThis.cct = { buildToolbar, FeedbackView, feedbackState, decorateComment, GITHUB_BODY_SHAPE,
        analyze, defaultConfig, splitBody, matchPrefix, resolveLabel, parseDecorations };
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true, format: 'iife', write: false, logLevel: 'silent',
});
const css = readFileSync(resolve(root, 'packages/extension/src/styles.css'), 'utf8');
const cssGithub = readFileSync(resolve(root, 'packages/adapters/github/src/platform.css'), 'utf8');

const browser = await chromium.launch({ executablePath: EXECUTABLE });
for (const lang of ['en', 'fr']) {
  const page = await browser.newPage({ viewport: { width: 860, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html data-cct-platform="github" lang="${lang}"><head><meta charset="utf-8"><style>
    :root {
      --fgColor-default:#1f2328; --fgColor-muted:#59636e; --fgColor-onEmphasis:#fff; --fgColor-accent:#0969da;
      --fgColor-danger:#d1242f; --fgColor-success:#1a7f37; --fgColor-attention:#9a6700;
      --bgColor-default:#fff; --bgColor-muted:#f6f8fa; --bgColor-accent-emphasis:#0969da;
      --borderColor-default:#d1d9e0; --borderColor-muted:#d1d9e0b3; --borderColor-accent-emphasis:#0969da;
      --borderColor-danger-emphasis:#cf222e; --borderColor-success-emphasis:#1a7f37; --borderColor-attention-emphasis:#9a6700;
      --button-default-bgColor-rest:#f6f8fa; --button-default-borderColor-rest:#d1d9e0;
      --overlay-bgColor:#fff; --base-size-8:8px;
    }
    body { font: 14px/1.5 -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; margin: 0; padding: 20px; width: 800px;
           color: var(--fgColor-default); background: #fff; }
    .scene { padding: 4px; }
    .card { border: 1px solid var(--borderColor-default); border-radius: 6px; }
    .card-head { background: var(--bgColor-muted); border-bottom: 1px solid var(--borderColor-default); padding: 8px 12px;
                 color: var(--fgColor-muted); font-size: 13px; border-radius: 6px 6px 0 0; }
    .card-head b { color: var(--fgColor-default); }
    .card-body { padding: 12px; }
    textarea { display: block; width: 100%; box-sizing: border-box; min-height: 96px; padding: 8px 12px; font: inherit;
               border: 1px solid var(--borderColor-default); border-radius: 6px; resize: none; color: inherit; background: #fff; }
    .comment-body p { margin: 0 0 16px; } .comment-body p:last-child { margin-bottom: 0; }
    .reply { margin-top: 12px; }
    ${css}
    ${cssGithub}
  </style></head><body></body></html>`);
  await page.addScriptTag({ content: bundled.outputFiles[0].text });

  await page.evaluate((lang) => {
    const c = globalThis.cct;
    const config = c.defaultConfig();
    const profile = { id: 'github', suggestionInfoString: 'suggestion' };
    const posed = (value) => {
      const line = c.splitBody(value).prefixLine;
      const m = line === null ? null : c.matchPrefix(line);
      if (m === null) return { hasPrefix: false, label: null, writtenLabel: null, decorations: [], malformedDecorations: false };
      const label = c.resolveLabel(m.label, config)?.label.id ?? null;
      if (m.decorations === null) return { hasPrefix: true, label, writtenLabel: m.label, decorations: [], malformedDecorations: false };
      const p = c.parseDecorations(m.decorations);
      return { hasPrefix: true, label, writtenLabel: m.label, decorations: p.canonical, malformedDecorations: p.syntaxIssues.length > 0 };
    };
    const composer = (id, title, text) => {
      const scene = document.createElement('div');
      scene.className = 'scene'; scene.id = id;
      scene.innerHTML = '<div class="card"><div class="card-head"><b></b></div><div class="card-body"><textarea></textarea></div></div>';
      scene.querySelector('b').textContent = title;
      document.body.appendChild(scene);
      const ta = scene.querySelector('textarea');
      ta.value = text;
      const toolbar = c.buildToolbar({ config, lang, onLabel() {}, onFreeDecoration() {}, currentPrefix: () => posed(ta.value) });
      ta.parentElement.insertBefore(toolbar.element, ta);
      toolbar.sync();
      const fb = new c.FeedbackView(ta, lang);
      const a = c.analyze({ body: text, platform: profile, isSystemGenerated: false, zone: 'thread-root', canCarryBlockingState: true }, { ...config, language: lang });
      fb.render({ state: c.feedbackState(a.diagnostics, false), diagnostics: a.diagnostics, aliasRewrite: a.aliasRewrite, onFix() {} });
    };
    const T = lang === 'fr'
      ? { add: 'Ajouter un commentaire', ok: 'issue (blocking): la boucle de reprise ne s’arrête jamais sur une réponse 4xx\n\nUn 404 est rejoué indéfiniment ; l’appelant n’abandonne que sur délai dépassé.',
          ko: 'isue: le nom est ambigu' }
      : { add: 'Add a comment', ok: 'issue (blocking): the retry loop never stops on a 4xx answer\n\nA 404 is retried forever; the caller only gives up on a timeout.',
          ko: 'isue: the name is ambiguous' };
    composer('composer', T.add, T.ok);
    composer('error', T.add, T.ko);

    const thread = document.createElement('div');
    thread.className = 'scene'; thread.id = 'published';
    document.body.appendChild(thread);
    const P = lang === 'fr'
      ? [['alice', '<p dir="auto">issue (blocking): la boucle de reprise ne s’arrête jamais sur une réponse 4xx</p><p dir="auto">Un 404 est rejoué indéfiniment ; l’appelant n’abandonne que sur délai dépassé.</p>'],
         ['bob', '<p dir="auto">done: les réponses 4xx ne sont plus rejouées</p>'],
         ['alice', '<p dir="auto">suggestion (non-blocking, perf): mettre le motif compilé en cache</p>']]
      : [['alice', '<p dir="auto">issue (blocking): the retry loop never stops on a 4xx answer</p><p dir="auto">A 404 is retried forever; the caller only gives up on a timeout.</p>'],
         ['bob', '<p dir="auto">done: 4xx answers are no longer retried</p>'],
         ['alice', '<p dir="auto">suggestion (non-blocking, perf): cache the compiled pattern</p>']];
    for (const [who, html] of P) {
      const card = document.createElement('div');
      card.className = 'card reply';
      card.innerHTML = '<div class="card-head"><b></b></div><div class="card-body comment-body"></div>';
      card.querySelector('b').textContent = who;
      const body = card.querySelector('.comment-body');
      body.innerHTML = html;
      thread.appendChild(card);
      c.decorateComment(body, body.innerText, config, profile, lang, c.GITHUB_BODY_SHAPE);
    }
  }, lang);

  for (const [id, name] of [['composer', 'toolbar'], ['error', 'diagnostic'], ['published', 'badges']]) {
    await page.locator('#' + id).screenshot({ path: `${out}/${name}-${lang}.png` });
    console.log(`  docs/images/${name}-${lang}.png`);
  }
  await page.close();
}
await browser.close();
