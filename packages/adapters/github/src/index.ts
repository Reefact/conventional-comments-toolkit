// Adaptateur client GitHub (composant A, §9.2.3, annexe A). Aucun appel d'API à jeton
// (§10) : configuration lue par la route web `raw` sur la session de l'utilisateur
// (§A.4), fils et résultat publié lus dans le DOM de la page.

import {
  decodeSummary,
  SUMMARY_PREFIX,
  type ConfigRead,
  type Disposable,
  type PlatformProfile,
  type PrRef,
  type PublishedSummary,
  type ThreadInfo,
  type UserInfo,
} from '@cct/core';
import {
  closestChain,
  commentBodyText,
  hostMatchesAny,
  queryChain,
  queryChainAll,
  writeToTextField,
  SelectorLog,
  type EditorContext,
  type EditorHandle,
  type PlatformAdapter,
  type SubmitControl,
} from '@cct/adapter-shared';
import { selectors } from './selectors.js';

export interface GithubClientOptions {
  /** Hôtes autorisés par l'utilisateur ou la politique (§2, §A.4) — github.com n'est que
   * le domaine pré-déclarable ; GHES et ghe.com passent par optional_host_permissions. */
  extraHosts?: string[];
  /** Fetch à employer pour les lectures faites par cet adaptateur — substitution de test,
   * ou contexte d'exécution qui n'a pas de `fetch` global. Ce n'est PAS le chemin vers le
   * service worker : une fonction ne franchit pas la frontière des contextes d'une
   * extension. Pour cela, voir `readOrgConfig` ci-dessous. */
  fetchImpl?: typeof fetch;
  /** Lecture du `configUrl` d'organisation par un chemin que cet adaptateur n'a pas. Dans
   * l'extension, c'est le service worker : le script de contenu émet ses requêtes au nom de
   * l'origine de la page et reste soumis à sa politique CORS, quelle que soit la permission
   * d'hôte accordée (doc Chrome, « Cross-origin network requests ») ; un `configUrl` hébergé
   * hors de la plateforme affichée n'y est donc pas lisible.
   *
   * **Rendre `null` signifie « lis-le toi-même »**, et cette troisième réponse est
   * nécessaire : l'appelant est seul à savoir si l'URL est de MÊME origine que la page, cas
   * où la lecture directe fonctionne — et où le détour par le worker échouerait, faute d'une
   * permission d'hôte sur le domaine de plateforme que le manifeste ne déclare plus (revue
   * Codex, PR #30). La décision est donc prise par URL, pas une fois pour toutes.
   *
   * Absent — usage hors extension, tests — le `fetch` direct ci-dessous s'applique de même. */
  readOrgConfig?: (url: string) => Promise<ConfigRead> | null;
  documentRef?: Document;
  log?: SelectorLog;
}

/** `credentials` d'une lecture de configuration — décidé PAR URL, et non une fois pour toutes.
 *
 * La route `raw` de github.com redirige vers `raw.githubusercontent.com` dès que le fichier
 * existe, cette origine répond `Access-Control-Allow-Origin: *`, et le navigateur refuse le
 * joker quand la requête porte des cookies. `include` y échoue donc toujours.
 *
 * `'same-origin'` plutôt que `'omit'`, et la différence n'est pas cosmétique — elle est
 * MESURÉE (`npm run check:content-script-cors`) : le PREMIER saut, de même origine que la
 * page, part AVEC la session, donc GitHub autorise ; la redirection franchit une origine, le
 * navigateur cesse alors d'envoyer les cookies, et le joker est accepté. La configuration
 * d'un dépôt PRIVÉ redevient ainsi lisible, sans permission d'hôte et sans relais — ce que
 * `'omit'`, écrit d'abord ici, sacrifiait sans rien obtenir en échange (revue Codex, PR #36,
 * round 4).
 *
 * Partout ailleurs, `include` reste la règle, et l'absence de mesure est ici l'argument, pas
 * une négligence : sur un GitHub Enterprise Server accepté par `extraHosts`, nous n'avons
 * PAS observé de redirection hors origine. Le défaut se corrige là où il est démontré,
 * nulle part ailleurs. */
export function configCredentials(url: string): RequestCredentials {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'include';
  }
  // Hôte ET chemin : sur github.com, seule la route `raw` redirige. Une autre URL du même
  // domaine (page HTML, route d'API) n'a aucune raison de perdre sa session.
  return parsed.hostname === 'github.com' && parsed.pathname.includes('/raw/')
    ? 'same-origin'
    : 'include';
}

export class GithubClientAdapter implements PlatformAdapter {
  #hosts: string[];
  #fetch: typeof fetch;
  #doc: Document;
  #readOrgConfig?: (url: string) => Promise<ConfigRead> | null;
  readonly log: SelectorLog;
  #editorSeq = 0;

  constructor(opts: GithubClientOptions = {}) {
    this.#hosts = ['github.com', ...(opts.extraHosts ?? [])];
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#doc = opts.documentRef ?? document;
    this.#readOrgConfig = opts.readOrgConfig;
    this.log = opts.log ?? new SelectorLog();
  }

  /** Sélection de plateforme par hôte seul (§2) — `bootstrap()` choisit l'adaptateur à
   * l'injection du script, avant même de savoir si la page courante est une PR : la
   * navigation vers une PR arrive presque toujours ENSUITE, via un lien interne (liste des
   * PR, notifications, tableau de bord), en SPA (§A.3). Exiger une PR ici laisserait
   * l'extension intégralement inactive tant qu'un rechargement complet ne la relance pas
   * directement sur l'URL de la PR. */
  matchesHost(url: URL): boolean {
    // `hostMatchesAny` et non une égalité stricte : un hôte accordé peut être un joker
    // `*.ghe.com` (§A.4 — sous-domaine dédié par client, inconnu à la compilation).
    return hostMatchesAny(url.hostname, this.#hosts);
  }

  matches(url: URL): boolean {
    return this.matchesHost(url) && /\/pull\/\d+/.test(url.pathname);
  }

  platformProfile(): PlatformProfile {
    // Même profil que l'adaptateur serveur, même source (§9.2.4).
    return { id: 'github', suggestionInfoString: 'suggestion' };
  }

  /** Route web `raw` — et sur github.com en `same-origin`, ce qui demande une explication,
   * parce que le réflexe (`include`) ne marche pas. Le choix est fait par
   * `configCredentials()`, qui dit aussi pourquoi il ne s'étend pas aux autres hôtes.
   *
   * La route `raw` de github.com **redirige** vers `raw.githubusercontent.com` dès que le
   * fichier existe (302 ; un fichier absent rend 404 sans redirection). La requête part de
   * l'origine de la page, mais la réponse vient d'une AUTRE origine, qui répond
   * `Access-Control-Allow-Origin: *`. Or le navigateur refuse le joker `*` quand la requête
   * porte `credentials: 'include'` : « the value of the Access-Control-Allow-Origin header
   * must not be the wildcard '*' when the request's credentials mode is 'include' ». Le
   * `fetch` LÈVE, la lecture rend `unreachable`, et l'extension affiche l'état dégradé du
   * §5.4 sur tout dépôt qui possède une configuration — c'est-à-dire précisément ceux qui en
   * ont une à lire. Le niveau « dépôt » du §8.2 n'a donc jamais été lisible sur GitHub.
   *
   * MESURÉ, pas déduit : `npm run check:content-script-cors` reproduit les quatre cas dans un
   * vrai Chromium (même origine, redirection vers une cible sans CORS, vers une cible en
   * `ACAO: *` avec et sans cookies). Deux documents de ce dépôt affirmaient à l'inverse que
   * cette lecture était « une requête same-origin » sans frontière CORS : vrai de la requête,
   * faux de la redirection.
   *
   * Un dépôt PRIVÉ est lisible tant qu'une session est ouverte : c'est tout l'intérêt du
   * `same-origin`. Il ne l'est plus pour un visiteur déconnecté, et la route refuse alors —
   * avec QUEL code, nous ne l'avons pas mesuré (le proxy de l'environnement de développement
   * intercepte tout dépôt hors périmètre et répond lui-même, y compris pour un dépôt
   * inexistant). Les deux réponses sont donc traitées : 403 rend `unreachable` directement, et
   * un 404 — GitHub masquant volontiers le privé en « inexistant » — est reclassé plus bas dès
   * que la page dit le dépôt privé. Dans les deux cas l'extension DIT qu'elle n'a pas pu lire,
   * au lieu de prétendre qu'il n'y a pas de fichier. */
  async getRepoConfig(pr: PrRef): Promise<ConfigRead> {
    const url = `https://${pr.host}/${pr.scope.join('/')}/raw/HEAD/.conventional-comments.json`;
    const credentials = configCredentials(url);
    try {
      const res = await this.#fetch(url, { credentials });
      if (res.status === 404) {
        // Un 404 ne dit pas toujours « pas de fichier ». `same-origin` authentifie le premier
        // saut, ce qui rend ce 404 fiable POUR UNE SESSION OUVERTE — mais pas pour un visiteur
        // déconnecté, à qui GitHub masque le privé en répondant ce qu'il répondrait pour un
        // dépôt inexistant. Classer cela `absent` ferait pire que le bandeau : le résolveur
        // mettrait `degraded: false` en cache et l'extension appliquerait les niveaux
        // inférieurs en AFFIRMANT avoir lu la configuration du dépôt (revue Codex, round 2).
        // Le cas est devenu rare ; il n'a pas disparu.
        //
        // La visibilité est donc lue dans la page, qui la porte. Et la conclusion ne se tire
        // que sur une preuve POSITIVE de dépôt privé : visibilité inconnue — sélecteur pourri,
        // page qui ne le dit plus — vaut `absent`, c'est-à-dire exactement le comportement
        // d'avant. Une dégradation de sélecteur ne peut pas faire apparaître un bandeau sur
        // les dépôts publics, qui sont le cas courant.
        const masked = credentials !== 'include' && this.#repoIsPublic() === false;
        return masked
          ? { status: 'unreachable', reason: 'HTTP 404 (dépôt privé : absence indiscernable)' }
          : { status: 'absent' };
      }
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** Le dépôt affiché est-il public ? `null` quand la page ne le dit pas — et ce troisième
   * cas est le défaut sûr, pas un oubli : voir `getRepoConfig()`. */
  #repoIsPublic(): boolean | null {
    const meta = queryChain(this.#doc, selectors.repositoryPublicMeta).element;
    const flag = meta?.getAttribute('content')?.trim().toLowerCase();
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    // Repli par le badge visible : filtré par TEXTE, ses classes étant partagées.
    for (const el of queryChainAll(this.#doc, selectors.repositoryVisibilityLabel)) {
      const text = el.textContent?.trim().toLowerCase();
      if (text === 'public') return true;
      if (text === 'private') return false;
    }
    this.log.degraded(selectors.repositoryPublicMeta);
    return null;
  }

  async getOrgConfig(url: string | null): Promise<ConfigRead> {
    if (url === null) return { status: 'absent' };
    // `null` : l'appelant décline pour CETTE url (même origine que la page) — la lecture
    // directe ci-dessous est alors la bonne, et la seule qui aboutisse. Elle passe par
    // `configCredentials()` comme celle du dépôt : un `configUrl` d'organisation en
    // `https://github.com/<org>/<dépôt>/raw/...` est de même origine que la page, donc décliné
    // par le relais, et prenait exactement le mur de la redirection que ce dépôt vient de
    // documenter (revue Codex, PR #36, P2).
    const relayed = this.#readOrgConfig?.(url);
    if (relayed) return relayed;
    const credentials = configCredentials(url);
    try {
      const res = await this.#fetch(url, { credentials });
      if (res.status === 404) {
        // Même ambiguïté que pour le dépôt — sans le moyen de la lever. Le `configUrl` désigne
        // un AUTRE dépôt que celui affiché, dont la page ne dit pas la visibilité : sans
        // session ouverte, une ressource privée y rend le même 404 qu'un fichier supprimé
        // (revue Codex, PR #36, round 3).
        //
        // Faute de pouvoir distinguer, on refuse de conclure « pas de configuration
        // d'organisation ». Le vrai cas nominal est ailleurs et reste intact : aucune URL
        // déclarée, traité juste au-dessus. Ici une URL EST déclarée par le canal de plancher
        // (§8.1.1) — elle nomme un document censé exister, et un 404 est d'abord le signe qu'on
        // ne l'a pas lu. Coût assumé : un `configUrl` pointant sur un fichier réellement
        // supprimé affiche l'état dégradé au lieu de se taire ; c'est le bon sens de l'erreur
        // (§8.1.3, règle 2 — désarmer en le disant plutôt que bloquer sur une règle non lue).
        return credentials !== 'include'
          ? { status: 'unreachable', reason: 'HTTP 404 (absence indiscernable d\'un accès refusé)' }
          : { status: 'absent' };
      }
      if (!res.ok) return { status: 'unreachable', reason: `HTTP ${res.status}` };
      return { status: 'found', text: await res.text() };
    } catch (e) {
      return { status: 'unreachable', reason: String(e) };
    }
  }

  /** Écoute Turbo ET MutationObserver : les vues React changent le DOM sans émettre
   * d'événement Turbo (§A.3). */
  observeEditors(cb: (editor: EditorHandle) => void): Disposable {
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of queryChainAll(this.#doc, selectors.editors)) {
        if (seen.has(el)) continue;
        // Marquer « vu » APRÈS #toHandle() : un élément balayé avant que currentPr() ne
        // trouve de PR (page pas encore navigée) doit rester réexaminable au prochain
        // balayage, pas définitivement ignoré (§9.2.3).
        const handle = this.#toHandle(el);
        if (!handle) continue;
        seen.add(el);
        cb(handle);
      }
    };
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(this.#doc.documentElement, { childList: true, subtree: true });
    const turboHandler = () => scan();
    this.#doc.addEventListener('turbo:load', turboHandler);
    this.#doc.addEventListener('turbo:frame-load', turboHandler);
    return {
      dispose: () => {
        observer.disconnect();
        this.#doc.removeEventListener('turbo:load', turboHandler);
        this.#doc.removeEventListener('turbo:frame-load', turboHandler);
      },
    };
  }

  getSubmitControls(editor: EditorHandle): SubmitControl[] {
    const form = closestChain(editor.element, selectors.submitContainer).element ?? editor.element.parentElement;
    if (!form) return [];
    // Jamais de contrôle `complete-pr` ici : seul getCompletionControl() l'expose, et il
    // n'est jamais intercepté (§9.2.3).
    return queryChainAll(form, selectors.submitButtons).map((element) => ({
      element,
      kind: 'submit' as const,
    }));
  }

  readValue(editor: EditorHandle): string {
    return (editor.element as HTMLTextAreaElement).value ?? '';
  }

  writeValue(editor: EditorHandle, text: string, caret?: number): void {
    // Stratégie commune du §9.3 : setter natif + événement input — jamais `value = …`,
    // que les vues React absorbent (§A.2).
    writeToTextField(editor.element as HTMLTextAreaElement, text, caret);
  }

  /** Fils lus dans le DOM de la page uniquement — jamais d'appel d'API (§10, §9.2.3).
   * `resolution: 'unknown'` quand l'état n'y est pas rendu. */
  async getThreads(): Promise<ThreadInfo[]> {
    const pr = this.currentPr();
    if (!pr) return [];
    const containers = queryChainAll(this.#doc, selectors.renderedThreads);
    return containers.map((el, i) => {
      const id = el.id || el.getAttribute('data-thread-id') || `dom-thread-${i}`;
      const resolvedOutcome = queryChain(el, selectors.resolvedMarker);
      const bodyEl = queryChain(el, selectors.commentBody).element;
      const author = queryChain(el, selectors.commentAuthor).element?.textContent?.trim() ?? '';
      const anchorOutcome = queryChain(el, selectors.threadAnchor);
      if (!anchorOutcome.element) this.log.degraded(selectors.threadAnchor); // §9.4
      const anchor = anchorOutcome.element?.getAttribute('href') ?? `#${id}`;
      return {
        id,
        pr,
        root: {
          id: `${id}-root`,
          author: { id: `login:${author.toLowerCase()}`, login: author, isServiceAccount: false },
          body: bodyEl ? commentBodyText(bodyEl) : '',
          createdAt: '',
          permalink: anchor,
          isSystemGenerated: false,
          canCarryBlockingState: true,
        },
        replies: [],
        resolution: resolvedOutcome.element ? ('resolved' as const) : ('unknown' as const),
        canCarryBlockingState: true,
      };
    });
  }

  getCompletionControl(): SubmitControl | null {
    const { element } = queryChain(this.#doc, selectors.mergeButton);
    if (!element) {
      this.log.degraded(selectors.mergeButton);
      return null;
    }
    return { element, kind: 'complete-pr' };
  }

  async getCurrentUser(): Promise<UserInfo> {
    const { element } = queryChain(this.#doc, selectors.currentUser);
    const login = element?.getAttribute('content') ?? '';
    return { id: `login:${login.toLowerCase()}`, login, isServiceAccount: false };
  }

  /** Ligne cc/1 lue dans le DOM — le titre du check run, rendu sur la page de la PR
   * (§6.3.1, §A.8). Jamais d'appel d'API (§8.1.3, §10). */
  readPublishedResult(): PublishedSummary | null {
    for (const el of queryChainAll(this.#doc, selectors.checkRunTitles)) {
      const text = el.textContent ?? '';
      const idx = text.indexOf(SUMMARY_PREFIX + ' ');
      if (idx === -1) continue;
      const line = text.slice(idx).split('\n')[0]!.trim();
      const summary = decodeSummary(line);
      if (summary) return summary;
    }
    return null;
  }

  /** Commentaires rendus sur la page, pour les badges du §5.5 — surface d'affichage,
   * hors du contrat normatif §9.2.3. */
  getRenderedComments(): { element: Element; bodyText: string }[] {
    return queryChainAll(this.#doc, selectors.commentBody).map((element) => ({
      element,
      bodyText: commentBodyText(element),
    }));
  }

  /** Sonde bon marché du nombre de commentaires rendus, pour la signature de reprise du
   * bandeau (content-internal.ts, chromeSignatureOf) — jamais `getRenderedComments()` pour
   * ça : cette dernière calcule `commentBodyText` (clone du sous-arbre dès qu'un badge est
   * posé) pour CHAQUE commentaire, alors que seul le compte importe à un observateur qui
   * tourne à chaque mutation, pour toute la durée de vie de l'onglet. */
  getRenderedCommentCount(): number {
    return queryChainAll(this.#doc, selectors.commentBody).length;
  }

  /** Les mêmes éléments, sans leur `bodyText` — pour la signature de NOTRE propre sortie
   * (content-internal.ts, ownOutputSignatureOf), qui doit remarquer qu'un corps réécrit par
   * la plateforme (mise à jour d'un commentaire) a emporté nos badges et notre masquage de
   * préfixe. Même raison qu'au-dessus d'écarter `getRenderedComments()` : le clone qu'elle
   * fait par commentaire décoré n'a pas à être payé à chaque mutation. Ces corps ne sont
   * PAS un sous-ensemble de `getRenderedThreadElements()` : un commentaire de la
   * conversation n'appartient à aucun fil de revue. */
  getRenderedCommentElements(): Element[] {
    return queryChainAll(this.#doc, selectors.commentBody);
  }

  /** Élément après lequel insérer le bandeau (§5.5) — surface d'affichage, hors du contrat
   * normatif §9.2.3. Null quand rien n'apparie : l'appelant se replie sur le haut du
   * document plutôt que de ne rien afficher. */
  getBannerMount(): Element | null {
    return queryChain(this.#doc, selectors.bannerMount).element;
  }

  /** Conteneurs de fils rendus, pour le filtre local du §5.5 — même dérivation
   * d'identifiant que getThreads(), même surface d'affichage hors contrat. */
  getRenderedThreadElements(): { id: string; element: Element }[] {
    return queryChainAll(this.#doc, selectors.renderedThreads).map((el, i) => ({
      id: el.id || el.getAttribute('data-thread-id') || `dom-thread-${i}`,
      element: el,
    }));
  }

  /** PrRef depuis l'URL et la page — la date de création est lisible dans le DOM (§6.2.3). */
  currentPr(): PrRef | null {
    const loc = this.#doc.location;
    const m = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(loc?.pathname ?? '');
    if (!m) return null;
    const { element } = queryChain(this.#doc, selectors.prCreatedAt);
    const createdAt = element?.getAttribute('datetime') ?? '';
    return {
      platform: 'github',
      createdAt,
      // `host` et non `hostname` : il PORTE LE PORT quand il est non standard. `pr.host`
      // sert à bâtir les URL de lecture de configuration (`https://${pr.host}/…`) ; une
      // instance GHES servie sur `ghes.corp:8443` verrait sinon sa configuration demandée
      // au port 443, donc jamais lue, et l'extension basculerait en état dégradé (revue
      // Codex, PR #29). La reconnaissance d'hôte, elle, reste sur `hostname` : les motifs
      // de correspondance de Chrome ignorent le port.
      host: loc!.host,
      scope: [m[1]!, m[2]!],
      number: Number(m[3]),
    };
  }

  #toHandle(el: Element): EditorHandle | null {
    const pr = this.currentPr();
    if (!pr) return null;
    const context = this.#contextOf(el, pr);
    this.#editorSeq++;
    return { id: `gh-editor-${this.#editorSeq}`, element: el, context };
  }

  /** Zone de l'éditeur (§4.1) : réponse dans un fil, corps de revue, conversation
   * générale, ou racine de fil (diff). Sur une édition, `commentId` et `threadId` sont
   * renseignés (§9.2.3 : commentId « renseigné pour 'edit' », threadId « pour toute
   * action: 'edit' »). */
  #contextOf(el: Element, pr: PrRef): EditorContext {
    const action: 'compose' | 'edit' = closestChain(el, selectors.editForm).element ? 'edit' : 'compose';
    // Identifiant du commentaire édité, lu dans le DOM (#issuecomment-…, #discussion_r…).
    const editedId =
      action === 'edit' ? closestChain(el, selectors.renderedComment).element?.id || undefined : undefined;
    const thread = closestChain(el, selectors.threadContainer).element;
    if (thread) {
      // L'ÉDITION du commentaire RACINE d'un fil reste zone 'thread-root' (§4.1, §4.3) :
      // la classer 'reply' la soustrairait à la validation par défaut et à la monotonie.
      if (action === 'edit') {
        // MÊME candidat pour la liste des commentaires et pour l'ancêtre du champ édité :
        // deux stratégies divergentes (premier candidat qui matche contre union des
        // candidats) peuvent désigner des générations différentes et reclasseraient
        // silencieusement une racine en réponse.
        let comments: Element[] = [];
        let editedComment: Element | null = null;
        for (const candidate of selectors.renderedComment.candidates) {
          const found = [...thread.querySelectorAll(candidate)];
          if (found.length > 0) {
            comments = found;
            editedComment = el.closest(candidate);
            break;
          }
        }
        if (comments.length > 0 && editedComment === null) {
          // Le fil rend des commentaires mais l'éditeur n'est dans aucun : dégradation de
          // sélecteur, journalisée (§9.4) — le repli 'reply' désactive la validation
          // localement, jamais silencieusement.
          this.log.degraded(selectors.renderedComment);
        }
        const isRootEdit = comments.length > 0 && editedComment === comments[0];
        if (isRootEdit) {
          return {
            zone: 'thread-root',
            action,
            pr,
            threadId: thread.id || editedId,
            commentId: editedId,
            canCarryBlockingState: true,
            inScope: true,
          };
        }
        return {
          zone: 'reply',
          action,
          pr,
          threadId: thread.id || editedId,
          commentId: editedId,
          canCarryBlockingState: false,
          inScope: true,
        };
      }
      return {
        zone: 'reply',
        action,
        pr,
        threadId: thread.id || undefined,
        canCarryBlockingState: false,
        inScope: true, // recalculé par l'extension avec activatedAt (§6.2.3)
      };
    }
    // Hors conteneur de fil : sur une édition, le commentaire édité est son propre fil —
    // threadId et commentId portent son identifiant (§9.2.3).
    const editIds = action === 'edit' ? { threadId: editedId, commentId: editedId } : {};
    if (closestChain(el, selectors.reviewSummaryForm).element) {
      return { zone: 'review-body', action, pr, ...editIds, canCarryBlockingState: false, inScope: true };
    }
    if (closestChain(el, selectors.conversationForm).element) {
      return { zone: 'conversation', action, pr, ...editIds, canCarryBlockingState: false, inScope: true };
    }
    // Commentaire inline sur une ligne de diff, ou racine de fil : porte un état de
    // résolution (§4.1).
    return { zone: 'thread-root', action, pr, ...editIds, canCarryBlockingState: true, inScope: true };
  }
}
