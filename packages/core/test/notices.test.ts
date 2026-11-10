// §5.3, §10 — chaque avis de configuration que core produit se rend dans la langue de
// l'interface. Les textes attendus sont écrits EN TOUTES LETTRES, un par message distinct et par
// langue : une entrée de catalogue retirée, un paramètre perdu en route ou une phrase rendue
// dans la mauvaise langue font échouer le cas qui la produit. Chaque avis est obtenu par le
// chemin réel — `resolveConfig()` sur un plancher et des documents —, jamais fabriqué à la main.

import { describe, expect, it } from 'vitest';
import type { ConfigRead, Floor } from '../src/types.js';
import { resolveConfig } from '../src/config/resolve.js';
import { noticeText } from '../src/config/notices.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const foundText = (t: string): ConfigRead => ({ status: 'found', text: t });

interface Case {
  title: string;
  resolve: () => ReturnType<typeof resolveConfig>;
  code: string;
  en: string;
  fr: string;
}

const CASES: Case[] = [
  {
    title: "floor-override, clé du fichier de dépôt",
    resolve: () => resolveConfig({ minimumMode: 'enforce' }, absent, found({ mode: 'off' })),
    code: "floor-override.repo",
    en: "Enterprise floor: repository configuration key \"mode\" ignored: it would relax the enterprise floor (§8.1.1).",
    fr: "Plancher d’entreprise : clé « mode » du fichier de configuration du dépôt ignorée : elle assouplirait le plancher d’entreprise (§8.1.1).",
  },
  {
    title: "floor-override, clé du document d’organisation",
    resolve: () => resolveConfig({ minimumMode: 'enforce' }, found({ mode: 'off' }), absent),
    code: "floor-override.org",
    en: "Enterprise floor: organization configuration key \"mode\" ignored: it would relax the enterprise floor (§8.1.1).",
    fr: "Plancher d’entreprise : clé « mode » de la configuration d’organisation ignorée : elle assouplirait le plancher d’entreprise (§8.1.1).",
  },
  {
    title: "JSON illisible, ligne connue",
    resolve: () => resolveConfig(null, absent, foundText('{\n  "mode": "off",\n  oops\n}')),
    code: "invalid.json",
    en: "Invalid configuration: unparseable JSON (line 3).",
    fr: "Configuration invalide : JSON illisible (ligne 3).",
  },
  {
    title: "JSON illisible, ligne inconnue",
    resolve: () => resolveConfig(null, absent, foundText('')),
    code: "invalid.json-no-line",
    en: "Invalid configuration: unparseable JSON.",
    fr: "Configuration invalide : JSON illisible.",
  },
  {
    title: "document qui n’est pas un objet",
    resolve: () => resolveConfig(null, absent, foundText('[]')),
    code: "invalid.not-object",
    en: "Invalid configuration: the configuration document must be a JSON object.",
    fr: "Configuration invalide : le document de configuration doit être un objet JSON.",
  },
  {
    title: "entier positif",
    resolve: () => resolveConfig(null, absent, found({ version: 0 })),
    code: "invalid.positive-integer",
    en: "Invalid configuration: key \"version\" must be a positive integer.",
    fr: "Configuration invalide : la clé « version » doit être un entier positif.",
  },
  {
    title: "entier positif ou nul",
    resolve: () => resolveConfig(null, absent, found({ configCacheTtlSeconds: -1 })),
    code: "invalid.non-negative-integer",
    en: "Invalid configuration: key \"configCacheTtlSeconds\" must be a non-negative integer.",
    fr: "Configuration invalide : la clé « configCacheTtlSeconds » doit être un entier positif ou nul.",
  },
  {
    title: "valeur hors liste",
    resolve: () => resolveConfig(null, absent, found({ mode: 'banana' })),
    code: "invalid.one-of",
    en: "Invalid configuration: key \"mode\" must be one of off, assist, enforce.",
    fr: "Configuration invalide : la clé « mode » doit valoir l’une de ces valeurs : off, assist, enforce.",
  },
  {
    title: "tableau attendu",
    resolve: () => resolveConfig(null, absent, found({ labels: {} })),
    code: "invalid.array",
    en: "Invalid configuration: key \"labels\" must be an array.",
    fr: "Configuration invalide : la clé « labels » doit être un tableau.",
  },
  {
    title: "objet attendu",
    resolve: () => resolveConfig(null, absent, found({ decorations: [] })),
    code: "invalid.object",
    en: "Invalid configuration: key \"decorations\" must be an object.",
    fr: "Configuration invalide : la clé « decorations » doit être un objet.",
  },
  {
    title: "tableau de chaînes attendu",
    resolve: () => resolveConfig(null, absent, found({ exemptUsers: [1] })),
    code: "invalid.string-array",
    en: "Invalid configuration: key \"exemptUsers\" must be an array of strings.",
    fr: "Configuration invalide : la clé « exemptUsers » doit être un tableau de chaînes.",
  },
  {
    title: "chaîne non vide attendue",
    resolve: () => resolveConfig(null, absent, found({ badgeStyle: '' })),
    code: "invalid.non-empty-string",
    en: "Invalid configuration: key \"badgeStyle\" must be a non-empty string.",
    fr: "Configuration invalide : la clé « badgeStyle » doit être une chaîne non vide.",
  },
  {
    title: "chaîne ou null attendue",
    resolve: () => resolveConfig(null, absent, found({ language: 1 })),
    code: "invalid.string-or-null",
    en: "Invalid configuration: key \"language\" must be a string or null.",
    fr: "Configuration invalide : la clé « language » doit être une chaîne ou null.",
  },
  {
    title: "version semver attendue",
    resolve: () => resolveConfig(null, absent, found({ coreMinVersion: 'x' })),
    code: "invalid.semver",
    en: "Invalid configuration: key \"coreMinVersion\" must be a semver string.",
    fr: "Configuration invalide : la clé « coreMinVersion » doit être une version semver.",
  },
  {
    title: "entrée de label sans id",
    resolve: () => resolveConfig(null, absent, found({ labels: [1] })),
    code: "invalid.label-entry",
    en: "Invalid configuration: key \"labels\": each entry must be an object with a string \"id\".",
    fr: "Configuration invalide : clé « labels » : chaque entrée doit être un objet portant un « id » textuel.",
  },
  {
    title: "drapeau de label non booléen",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', enabled: 'yes' }] })),
    code: "invalid.label-boolean",
    en: "Invalid configuration: key \"labels\": \"enabled\" of label \"issue\" must be a boolean.",
    fr: "Configuration invalide : clé « labels » : « enabled » du label « issue » doit être un booléen.",
  },
  {
    title: "propriété textuelle de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', icon: 1 }] })),
    code: "invalid.label-string",
    en: "Invalid configuration: key \"labels\": \"icon\" of label \"issue\" must be a string.",
    fr: "Configuration invalide : clé « labels » : « icon » du label « issue » doit être une chaîne.",
  },
  {
    title: "kind de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', kind: 'x' }] })),
    code: "invalid.label-kind",
    en: "Invalid configuration: key \"labels\": \"kind\" of label \"issue\" must be \"remark\" or \"reply\".",
    fr: "Configuration invalide : clé « labels » : « kind » du label « issue » doit valoir « remark » ou « reply ».",
  },
  {
    title: "aliases de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', aliases: 'x' }] })),
    code: "invalid.label-aliases",
    en: "Invalid configuration: key \"labels\": \"aliases\" of label \"issue\" must be an array of strings.",
    fr: "Configuration invalide : clé « labels » : « aliases » du label « issue » doit être un tableau de chaînes.",
  },
  {
    title: "sous-clé booléenne",
    resolve: () => resolveConfig(null, absent, found({ decorations: { allowFree: 'x' } })),
    code: "invalid.prop-boolean",
    en: "Invalid configuration: key \"decorations\": \"allowFree\" must be a boolean.",
    fr: "Configuration invalide : clé « decorations » : « allowFree » doit être un booléen.",
  },
  {
    title: "sous-clé tableau",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: {} } })),
    code: "invalid.prop-array",
    en: "Invalid configuration: key \"decorations\": \"known\" must be an array.",
    fr: "Configuration invalide : clé « decorations » : « known » doit être un tableau.",
  },
  {
    title: "sous-clé entière",
    resolve: () => resolveConfig(null, absent, found({ rules: { minSubjectLength: -1 } })),
    code: "invalid.prop-non-negative-integer",
    en: "Invalid configuration: key \"rules\": \"minSubjectLength\" must be a non-negative integer.",
    fr: "Configuration invalide : clé « rules » : « minSubjectLength » doit être un entier positif ou nul.",
  },
  {
    title: "sous-clé chaîne ou null",
    resolve: () => resolveConfig(null, absent, found({ telemetry: { endpoint: 1 } })),
    code: "invalid.prop-string-or-null",
    en: "Invalid configuration: key \"telemetry\": \"endpoint\" must be a string or null.",
    fr: "Configuration invalide : clé « telemetry » : « endpoint » doit être une chaîne ou null.",
  },
  {
    title: "décoration sans id",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: [1] } })),
    code: "invalid.decoration-entry",
    en: "Invalid configuration: key \"decorations\": each known decoration must be an object with a string \"id\".",
    fr: "Configuration invalide : clé « decorations » : chaque décoration connue doit être un objet portant un « id » textuel.",
  },
  {
    title: "forces de décoration",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: [{ id: 'ui', forces: 'x' }] } })),
    code: "invalid.decoration-forces",
    en: "Invalid configuration: key \"decorations\": \"forces\" of decoration \"ui\" must be \"blocking\", \"non-blocking\" or null.",
    fr: "Configuration invalide : clé « decorations » : « forces » de la décoration « ui » doit valoir « blocking », « non-blocking » ou null.",
  },
  {
    title: "sévérité hors liste",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'W-X': 'loud' } })),
    code: "invalid.severity",
    en: "Invalid configuration: key \"severities\": severity of \"W-X\" must be one of off, warn, error.",
    fr: "Configuration invalide : clé « severities » : la sévérité de « W-X » doit valoir l’une de ces valeurs : off, warn, error.",
  },
  {
    title: "abréviations",
    resolve: () => resolveConfig(null, absent, found({ shortcuts: { abbreviations: 1 } })),
    code: "invalid.abbreviations",
    en: "Invalid configuration: key \"shortcuts\": \"abbreviations\" must be an object mapping abbreviation to inserted text.",
    fr: "Configuration invalide : clé « shortcuts » : « abbreviations » doit être un objet qui associe une abréviation au texte inséré.",
  },
  {
    title: "clé inconnue",
    resolve: () => resolveConfig(null, absent, found({ banana: 1 })),
    code: "config.unknown-key",
    en: "Configuration warning: unknown configuration key \"banana\" ignored.",
    fr: "Avertissement de configuration : clé de configuration inconnue « banana » ignorée.",
  },
  {
    title: "mode « warn » obsolète",
    resolve: () => resolveConfig(null, absent, found({ mode: 'warn' })),
    code: "config.deprecated-warn",
    en: "Configuration warning: obsolete value \"warn\" for \"mode\": read as \"assist\" — replace it with \"assist\" (§7).",
    fr: "Avertissement de configuration : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7).",
  },
  {
    title: "configUrl dans le fichier du dépôt",
    resolve: () => resolveConfig(null, absent, found({ configUrl: 'https://example.test/cc.json' })),
    code: "config.repo-config-url",
    en: "Configuration warning: \"configUrl\" set in the repository file is ignored: the organization configuration URL comes exclusively from the floor channel (§8.1.2).",
    fr: "Avertissement de configuration : « configUrl » posée dans le fichier du dépôt est ignorée : l’URL de la configuration d’organisation vient exclusivement du canal de plancher (§8.1.2).",
  },
  {
    title: "entrée toolCommands",
    resolve: () => resolveConfig(null, absent, found({ toolCommands: ['LGTM'] })),
    code: "config.tool-command-invalid",
    en: "Configuration warning: toolCommands entry \"LGTM\" ignored: it must be \"/*\" or an exact \"@handle\".",
    fr: "Avertissement de configuration : entrée « LGTM » de toolCommands ignorée : elle doit être « /* » ou un « @handle » exact.",
  },
  {
    title: "trop de motifs d’allowlist",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: Array.from({ length: 51 }, (_, i) => `^p${i}$`) })),
    code: "config.allowlist-too-many",
    en: "Configuration warning: allowlist pattern ignored: more than 50 patterns.",
    fr: "Avertissement de configuration : motif d’allowlist ignoré : plus de 50 motifs.",
  },
  {
    title: "motif d’allowlist trop long",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['a'.repeat(257)] })),
    code: "config.allowlist-too-long",
    en: "Configuration warning: allowlist pattern ignored: longer than 256 characters.",
    fr: "Avertissement de configuration : motif d’allowlist ignoré : plus de 256 caractères.",
  },
  {
    title: "quantificateurs imbriqués",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['^(a+)+$'] })),
    code: "config.allowlist-nested",
    en: "Configuration warning: allowlist pattern ignored: nested quantifiers are not allowed.",
    fr: "Avertissement de configuration : motif d’allowlist ignoré : les quantificateurs imbriqués sont interdits.",
  },
  {
    title: "expression régulière invalide",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['('] })),
    code: "config.allowlist-invalid",
    en: "Configuration warning: allowlist pattern ignored: invalid regular expression.",
    fr: "Avertissement de configuration : motif d’allowlist ignoré : expression régulière invalide.",
  },
  {
    title: "sévérité E- relevée",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'E-NO-LABEL': 'off' } })),
    code: "config.severity-raised",
    en: "Configuration warning: severity of \"E-NO-LABEL\" cannot go below \"warn\" (§8.2): value \"off\" raised to \"warn\".",
    fr: "Avertissement de configuration : la sévérité de « E-NO-LABEL » ne peut pas descendre sous « warn » (§8.2) : la valeur « off » est relevée à « warn ».",
  },
  {
    title: "sévérité du marqueur de session plafonnée",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'W-SESSION-MULTIPLE': 'error' } })),
    code: "config.session-severity-capped",
    en: "Configuration warning: severity of \"W-SESSION-MULTIPLE\" cannot go above \"warn\" (§3.6): value \"error\" lowered to \"warn\".",
    fr: "Avertissement de configuration : la sévérité de « W-SESSION-MULTIPLE » ne peut pas dépasser « warn » (§3.6) : la valeur « error » est ramenée à « warn ».",
  },
  {
    title: "identifiants égaux à la casse près",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'Issue' }] })),
    code: "config.label-case-duplicate",
    en: "Configuration warning: label \"Issue\" ignored: its id differs from label \"issue\" only by case (§8.2).",
    fr: "Avertissement de configuration : label « Issue » ignoré : son identifiant ne diffère de celui du label « issue » que par la casse (§8.2).",
  },
  {
    title: "alias qui reprend un identifiant",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'nitpick', aliases: ['issue'] }] })),
    code: "config.alias-is-id",
    en: "Configuration warning: alias \"issue\" removed from label \"nitpick\": it is the id of label \"issue\" (§8.2).",
    fr: "Avertissement de configuration : alias « issue » retiré du label « nitpick » : c’est l’identifiant du label « issue » (§8.2).",
  },
  {
    title: "alias partagé",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'aaa', aliases: ['zz'] }, { id: 'bbb', aliases: ['zz'] }] })),
    code: "config.alias-shared",
    en: "Configuration warning: alias \"zz\" removed from label \"aaa\": it is also an alias of \"bbb\" (§8.2).",
    fr: "Avertissement de configuration : alias « zz » retiré du label « aaa » : c’est aussi un alias de \"bbb\" (§8.2).",
  },
  {
    title: "plancher : clé inconnue",
    resolve: () => resolveConfig({ banana: 1 } as unknown as Floor, absent, absent),
    code: "floor.unknown-key",
    en: "Configuration warning: unknown floor key \"banana\" ignored.",
    fr: "Avertissement de configuration : clé de plancher inconnue « banana » ignorée.",
  },
  {
    title: "plancher : tableau de chaînes attendu",
    resolve: () => resolveConfig({ exemptUsers: { closed: true } } as unknown as Floor, absent, absent),
    code: "floor.string-array",
    en: "Configuration warning: floor key \"exemptUsers.minimum\" ignored: expected an array of strings.",
    fr: "Avertissement de configuration : clé de plancher « exemptUsers.minimum » ignorée : un tableau de chaînes est attendu.",
  },
  {
    title: "plancher : entrées non textuelles",
    resolve: () => resolveConfig({ exemptUsers: { minimum: ['a', 1] } } as unknown as Floor, absent, absent),
    code: "floor.non-string-entries",
    en: "Configuration warning: floor key \"exemptUsers.minimum\": 1 non-string entry(ies) ignored.",
    fr: "Avertissement de configuration : clé de plancher « exemptUsers.minimum » : 1 entrée(s) non textuelle(s) ignorée(s).",
  },
  {
    title: "plancher : closed non booléen",
    resolve: () => resolveConfig({ exemptUsers: { minimum: [], closed: 'true' } } as unknown as Floor, absent, absent),
    code: "floor.closed-not-boolean",
    en: "Configuration warning: floor rule \"exemptUsers.closed\" is not a boolean: the list is kept closed.",
    fr: "Avertissement de configuration : la règle de plancher « exemptUsers.closed » n’est pas un booléen : la liste reste fermée.",
  },
  {
    title: "plancher : entier positif ou nul",
    resolve: () => resolveConfig({ configCacheTtlSeconds: -1 }, absent, absent),
    code: "floor.non-negative-integer",
    en: "Configuration warning: floor key \"configCacheTtlSeconds\" ignored: it must be a non-negative integer.",
    fr: "Avertissement de configuration : clé de plancher « configCacheTtlSeconds » ignorée : elle doit être un entier positif ou nul.",
  },
  {
    title: "plancher : valeur hors liste",
    resolve: () => resolveConfig({ minimumMode: 'x' } as unknown as Floor, absent, absent),
    code: "floor.one-of",
    en: "Configuration warning: floor key \"minimumMode\" ignored: it must be one of off, assist, enforce.",
    fr: "Avertissement de configuration : clé de plancher « minimumMode » ignorée : elle doit valoir l’une de ces valeurs : off, assist, enforce.",
  },
  {
    title: "plancher : objet attendu",
    resolve: () => resolveConfig({ rules: 1 } as unknown as Floor, absent, absent),
    code: "floor.object",
    en: "Configuration warning: floor key \"rules\" ignored: it must be an object.",
    fr: "Avertissement de configuration : clé de plancher « rules » ignorée : elle doit être un objet.",
  },
  {
    title: "plancher : chaîne ou null attendue",
    resolve: () => resolveConfig({ configUrl: 1 } as unknown as Floor, absent, absent),
    code: "floor.string-or-null",
    en: "Configuration warning: floor key \"configUrl\" ignored: it must be a string or null.",
    fr: "Avertissement de configuration : clé de plancher « configUrl » ignorée : elle doit être une chaîne ou null.",
  },
  {
    title: "plancher : sévérité hors liste",
    resolve: () => resolveConfig({ severities: { 'W-X': 'loud' } } as unknown as Floor, absent, absent),
    code: "floor.severity",
    en: "Configuration warning: floor severity of \"W-X\" ignored: it must be one of off, warn, error.",
    fr: "Avertissement de configuration : sévérité de plancher de « W-X » ignorée : elle doit valoir l’une de ces valeurs : off, warn, error.",
  },
  {
    title: "plancher : entrée toolCommands",
    resolve: () => resolveConfig({ toolCommands: { minimum: ['LGTM'] } }, absent, absent),
    code: "floor.tool-command-invalid",
    en: "Configuration warning: floor: toolCommands entry \"LGTM\" ignored: it must be \"/*\" or an exact \"@handle\".",
    fr: "Avertissement de configuration : plancher : entrée « LGTM » de toolCommands ignorée : elle doit être « /* » ou un « @handle » exact.",
  },
  {
    title: "plancher : trop de motifs",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: Array.from({ length: 51 }, (_, i) => `^p${i}$`) } }, absent, absent),
    code: "floor.allowlist-too-many",
    en: "Configuration warning: floor: allowlist pattern ignored: more than 50 patterns.",
    fr: "Avertissement de configuration : plancher : motif d’allowlist ignoré : plus de 50 motifs.",
  },
  {
    title: "plancher : motif trop long",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['a'.repeat(257)] } }, absent, absent),
    code: "floor.allowlist-too-long",
    en: "Configuration warning: floor: allowlist pattern ignored: longer than 256 characters.",
    fr: "Avertissement de configuration : plancher : motif d’allowlist ignoré : plus de 256 caractères.",
  },
  {
    title: "plancher : quantificateurs imbriqués",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['^(a+)+$'] } }, absent, absent),
    code: "floor.allowlist-nested",
    en: "Configuration warning: floor: allowlist pattern ignored: nested quantifiers are not allowed.",
    fr: "Avertissement de configuration : plancher : motif d’allowlist ignoré : les quantificateurs imbriqués sont interdits.",
  },
  {
    title: "plancher : expression régulière invalide",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['('] } }, absent, absent),
    code: "floor.allowlist-invalid",
    en: "Configuration warning: floor: allowlist pattern ignored: invalid regular expression.",
    fr: "Avertissement de configuration : plancher : motif d’allowlist ignoré : expression régulière invalide.",
  },
  {
    title: "version de schéma",
    resolve: () => resolveConfig(null, absent, found({ version: 99 })),
    code: "unsupported.schema-version",
    en: "Unsupported version: configuration schema version 99 exceeds supported version 1: falling back to assist mode (or the floor if stricter).",
    fr: "Version non prise en charge : la version de schéma 99 dépasse la version prise en charge, 1 : repli en mode assist (ou sur le plancher s’il est plus strict).",
  },
  {
    title: "coreMinVersion",
    resolve: () => resolveConfig(null, absent, found({ coreMinVersion: '9.0.0' })),
    code: "unsupported.core-version",
    en: "Unsupported version: coreMinVersion 9.0.0 requires core/ major 9, this component runs 1: falling back to assist mode (or the floor if stricter).",
    fr: "Version non prise en charge : coreMinVersion 9.0.0 exige la version majeure 9 de core/, ce composant exécute la 1 : repli en mode assist (ou sur le plancher s’il est plus strict).",
  },
  {
    title: "version de plancher",
    resolve: () => resolveConfig({ floorVersion: 99 }, absent, absent),
    code: "unsupported.floor-version",
    en: "Unsupported version: floor version 99 exceeds supported version 1: the floor is not applied and the component falls back to assist mode (§8.1.1).",
    fr: "Version non prise en charge : la version de plancher 99 dépasse la version prise en charge, 1 : le plancher n’est pas appliqué et le composant se replie en mode assist (§8.1.1).",
  },
];

describe('§5.3, §10 — le texte exact de chaque avis de configuration, en français et en anglais', () => {
  it.each(CASES)('$code — $title', ({ resolve, code, en, fr }) => {
    const notice = resolve().notices.find((n) => n.code === code);
    expect(notice, code).toBeDefined();
    expect(noticeText('fr', notice!)).toBe(fr);
    expect(noticeText('en', notice!)).toBe(en);
    // `message` est l'anglais du même catalogue — ce qu'un journal ou un test lit.
    expect(notice!.message).toBe(en);
  });

  it('chaque clé `notice.*` des catalogues a son cas ci-dessus', async () => {
    const { en } = await import('../src/i18n/en.js');
    const codes = Object.keys(en).filter((k) => k.startsWith('notice.')).map((k) => k.slice('notice.'.length));
    expect(CASES.map((c) => c.code).sort()).toEqual(codes.sort());
  });
});

describe('§8.1.1, CA-24 — `floor-override` nomme le niveau qui a écrit la clé ignorée', () => {
  const floor: Floor = { minimumMode: 'enforce' };
  const overrides = (org: ConfigRead, repo: ConfigRead) =>
    resolveConfig(floor, org, repo).notices.filter((n) => n.kind === 'floor-override');

  it('la clé écrite par l’organisation seule est attribuée à l’organisation', () => {
    const [n, ...rest] = overrides(found({ mode: 'off' }), absent);
    expect(rest).toEqual([]);
    expect(n!.code).toBe('floor-override.org');
    expect(noticeText('fr', n!)).not.toContain('dépôt');
    expect(noticeText('en', n!)).not.toContain('repository');
  });

  it('la clé écrite par les deux niveaux est attribuée au dépôt, dont la valeur l’emporte', () => {
    const ns = overrides(found({ mode: 'off' }), found({ mode: 'off' }));
    expect(ns.map((n) => n.code)).toEqual(['floor-override.repo']);
  });

  it('la clé de l’organisation que le dépôt durcit ne produit aucun avis', () => {
    expect(overrides(found({ mode: 'off' }), found({ mode: 'enforce' }))).toEqual([]);
  });

  it('une liste `closed` : un avis par niveau dont une entrée est écartée', () => {
    const closed: Floor = { exemptUsers: { minimum: [], closed: true } };
    const codes = (org: ConfigRead, repo: ConfigRead) =>
      resolveConfig(closed, org, repo).notices.filter((n) => n.kind === 'floor-override').map((n) => n.code);
    expect(codes(found({ exemptUsers: ['bot'] }), absent)).toEqual(['floor-override.org']);
    expect(codes(absent, found({ exemptUsers: ['bot'] }))).toEqual(['floor-override.repo']);
    expect(codes(found({ exemptUsers: ['a'] }), found({ exemptUsers: ['b'] }))).toEqual([
      'floor-override.org',
      'floor-override.repo',
    ]);
  });
});
