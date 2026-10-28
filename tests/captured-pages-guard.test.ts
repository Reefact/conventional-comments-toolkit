// Le masquage des pages capturées mis à l'épreuve sur des fragments fabriqués, dans la forme
// où GitHub les sert (relevés sur les captures du 2026-10-28). Les valeurs sont inventées.
import { describe, expect, it } from 'vitest';
import {
  findCapturedPageSecrets,
  MASK,
  redactCapturedPage,
  sharedOpaqueFields,
} from '../scripts/lib/captured-page-secrets.mjs';

const kinds = (html: string) => findCapturedPageSecrets(html).map((s: { kind: string }) => s.kind);

describe('pages capturées — secrets de session', () => {
  it('trouve les jetons CSRF des `<input data-csrf>`, qui ressemblent à tout autre champ caché', () => {
    const html = '<input type="hidden" value="abc123" data-csrf="true" class="js-data-preview-url-csrf">';
    expect(findCapturedPageSecrets(html)).toHaveLength(1);
    expect(redactCapturedPage(html)).toBe(
      `<input type="hidden" value="${MASK}" data-csrf="true" class="js-data-preview-url-csrf">`
    );
  });

  it("reconnaît un champ secret quel que soit l'ordre de ses attributs", () => {
    const before = '<input name="authenticity_token" value="t1" type="hidden">';
    const after = '<input type="hidden" value="t2" name="authenticity_token">';
    expect(findCapturedPageSecrets(before + after)).toHaveLength(2);
    expect(findCapturedPageSecrets(redactCapturedPage(before + after))).toEqual([]);
  });

  it('couvre les autres formes relevées : secret anti-spam, nonces, méta de session, JSON, socket et son identifiant de session', () => {
    const html = [
      '<input type="hidden" name="timestamp_secret" value="s1" class="form-control">',
      '<script nonce="n1"></script><div data-nonce="n2" data-channel="c1"></div>',
      '<a data-hydro-click-hmac="h1"></a>',
      '<meta name="visitor-hmac" content="v1"><meta name="fetch-nonce" content="v2">',
      '{"clientToken":"j1","websocketChannel":"eyJabc--sig","pullRequestState":"eyJdef--sig"}',
      '<link href="wss://alive.github.com/_sockets/u/8474127/ws?session=eyJses&amp;x=1">',
      '<link rel="shared-web-socket" data-session-id="0123abcd">',
    ].join('\n');
    expect(findCapturedPageSecrets(html)).toHaveLength(13);
    const masked = redactCapturedPage(html);
    expect(findCapturedPageSecrets(masked)).toEqual([]);
    expect(masked).toContain('_sockets/u/0/ws?session=REDACTED&amp;x=1');
  });

  it("laisse intact ce qui n'est pas un secret", () => {
    const html = [
      '<input type="hidden" name="current_oid" value="0123456789abcdef0123456789abcdef01234567">',
      '<meta name="user-login" content="Reefact">',
      '{"channelName":"pull_request"}',
      '<input type="hidden" value="" data-csrf="true">',
    ].join('\n');
    expect(kinds(html)).toEqual([]);
    expect(redactCapturedPage(html)).toBe(html.replace('value="" data-csrf', `value="${MASK}" data-csrf`));
  });

  it('est idempotent : une page masquée revient identique', () => {
    const html = '<input value="x" data-csrf="true"><meta name="request-id" content="r">';
    const once = redactCapturedPage(html);
    expect(redactCapturedPage(once)).toBe(once);
  });
});

describe('pages capturées — audit des champs opaques (plateforme nouvelle)', () => {
  const SESSION = '9f3a1c7e5b2d4f6081a3c5e7b9d1f3a5';
  const page = (title: string, commit: string) =>
    `<title>${title}</title><link rel="shared-web-socket" data-session-id="${SESSION}">` +
    `<input name="current_oid" value="${commit}"><div class="prc-Button-ButtonBase-9n-Xk"></div>`;

  it('nomme un champ dont la valeur revient sur des PR DIFFÉRENTES — sans jamais la recopier', () => {
    const fields = sharedOpaqueFields([page('PR #1', 'a1b2c3d4e5f6a7b8c9d0a1b2'), page('PR #2', 'f0e1d2c3b4a5968778695a4b')]);
    expect(fields).toEqual([{ name: 'link[rel=shared-web-socket] @data-session-id', prs: 2 }]);
    expect(JSON.stringify(fields)).not.toContain(SESSION);
  });

  it('ignore ce que partagent deux captures de la MÊME PR : ses données ne sont pas de la session', () => {
    const commit = 'a1b2c3d4e5f6a7b8c9d0a1b2';
    const fields = sharedOpaqueFields([page('PR #1', commit), page('PR #1', commit), page('PR #2', 'f0e1d2c3b4a5968778695a4b')]);
    expect(fields.map((f: { name: string }) => f.name)).not.toContain('input[name=current_oid] @value');
  });

  it('ne compte pas une valeur déjà masquée', () => {
    const masked = (title: string) => `<title>${title}</title><link rel="shared-web-socket" data-session-id="${MASK}">`;
    expect(sharedOpaqueFields([masked('PR #1'), masked('PR #2')])).toEqual([]);
  });
});

