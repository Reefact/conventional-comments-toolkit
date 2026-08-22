// Service worker MV3 (event page sur Firefox — §10, Compatibilité). Rôle minimal :
// répondre aux demandes de lecture de configuration des scripts de contenu quand la
// permission d'hôte vit ici, et porter la demande d'`optional_host_permissions` depuis
// la page d'options. Aucun secret, aucun jeton (§10).

interface FetchConfigRequest {
  kind: 'cct-fetch-config';
  url: string;
}

declare const chrome: {
  runtime: {
    onMessage: {
      addListener: (
        cb: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void
      ) => void;
    };
  };
} | undefined;

chrome?.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const req = message as FetchConfigRequest;
  if (req?.kind !== 'cct-fetch-config') return;
  void (async () => {
    try {
      const res = await fetch(req.url, { credentials: 'include' });
      if (res.status === 404) return sendResponse({ status: 'absent' });
      if (!res.ok) return sendResponse({ status: 'unreachable', reason: `HTTP ${res.status}` });
      sendResponse({ status: 'found', text: await res.text() });
    } catch (e) {
      sendResponse({ status: 'unreachable', reason: String(e) });
    }
  })();
  return true; // réponse asynchrone
});
