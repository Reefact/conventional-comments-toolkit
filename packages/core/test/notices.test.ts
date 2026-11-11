// §5.3, §10 — chaque avis de configuration que core produit se rend dans la langue de
// l'interface, et cite le niveau de configuration en cause. Les textes attendus sont écrits EN
// TOUTES LETTRES, un par message distinct, par niveau et par langue : une entrée de catalogue
// retirée, un paramètre perdu en route, un niveau non transmis ou une phrase rendue dans la
// mauvaise langue font échouer le cas qui la produit. Chaque avis est obtenu par le chemin
// réel — `resolveConfig()` sur un plancher et des documents —, jamais fabriqué à la main.

import { describe, expect, it } from 'vitest';
import type { ConfigRead, Floor, Notice } from '../src/types.js';
import { resolveConfig } from '../src/config/resolve.js';
import { noticeText } from '../src/config/notices.js';
import { en as EN } from '../src/i18n/en.js';

const absent: ConfigRead = { status: 'absent' };
const found = (o: object): ConfigRead => ({ status: 'found', text: JSON.stringify(o) });
const foundText = (t: string): ConfigRead => ({ status: 'found', text: t });
const texts = (n: Notice) => ({ en: noticeText('en', n), fr: noticeText('fr', n) });

interface Case {
  title: string;
  resolve: () => ReturnType<typeof resolveConfig>;
  code: string;
  level: string;
  en: string;
  fr: string;
}

const CASES: Case[] = [
  {
    title: "clé du fichier de dépôt",
    resolve: () => resolveConfig({ minimumMode: 'enforce' }, absent, found({ mode: 'off' })),
    code: "floor-override",
    level: "repo",
    en: "Enterprise floor (repository file): key \"mode\" ignored: it would relax the enterprise floor (§8.1.1).",
    fr: "Plancher d’entreprise (fichier du dépôt) : clé « mode » ignorée : elle assouplirait le plancher d’entreprise (§8.1.1).",
  },
  {
    title: "clé du document d’organisation",
    resolve: () => resolveConfig({ minimumMode: 'enforce' }, found({ mode: 'off' }), absent),
    code: "floor-override",
    level: "org",
    en: "Enterprise floor (organization configuration): key \"mode\" ignored: it would relax the enterprise floor (§8.1.1).",
    fr: "Plancher d’entreprise (configuration d’organisation) : clé « mode » ignorée : elle assouplirait le plancher d’entreprise (§8.1.1).",
  },
  {
    title: "JSON illisible, ligne connue",
    resolve: () => resolveConfig(null, absent, foundText('{\n  "mode": "off",\n  oops\n}')),
    code: "invalid.json",
    level: "repo",
    en: "Invalid configuration (repository file): unparseable JSON (line 3).",
    fr: "Configuration invalide (fichier du dépôt) : JSON illisible (ligne 3).",
  },
  {
    title: "JSON illisible, ligne inconnue",
    resolve: () => resolveConfig(null, absent, foundText('')),
    code: "invalid.json-no-line",
    level: "repo",
    en: "Invalid configuration (repository file): unparseable JSON.",
    fr: "Configuration invalide (fichier du dépôt) : JSON illisible.",
  },
  {
    title: "document qui n’est pas un objet",
    resolve: () => resolveConfig(null, absent, foundText('[]')),
    code: "invalid.not-object",
    level: "repo",
    en: "Invalid configuration (repository file): the configuration document must be a JSON object.",
    fr: "Configuration invalide (fichier du dépôt) : le document de configuration doit être un objet JSON.",
  },
  {
    title: "entier positif",
    resolve: () => resolveConfig(null, absent, found({ version: 0 })),
    code: "invalid.positive-integer",
    level: "repo",
    en: "Invalid configuration (repository file): key \"version\" must be a positive integer.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « version » doit être un entier positif.",
  },
  {
    title: "entier positif ou nul",
    resolve: () => resolveConfig(null, absent, found({ configCacheTtlSeconds: -1 })),
    code: "invalid.non-negative-integer",
    level: "repo",
    en: "Invalid configuration (repository file): key \"configCacheTtlSeconds\" must be a non-negative integer.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « configCacheTtlSeconds » doit être un entier positif ou nul.",
  },
  {
    title: "valeur hors liste",
    resolve: () => resolveConfig(null, absent, found({ mode: 'banana' })),
    code: "invalid.one-of",
    level: "repo",
    en: "Invalid configuration (repository file): key \"mode\" must be one of off, assist, enforce.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « mode » doit valoir l’une de ces valeurs : off, assist, enforce.",
  },
  {
    title: "valeur hors liste, organisation",
    resolve: () => resolveConfig(null, found({ mode: 'banana' }), absent),
    code: "invalid.one-of",
    level: "org",
    en: "Invalid configuration (organization configuration): key \"mode\" must be one of off, assist, enforce.",
    fr: "Configuration invalide (configuration d’organisation) : la clé « mode » doit valoir l’une de ces valeurs : off, assist, enforce.",
  },
  {
    title: "tableau attendu",
    resolve: () => resolveConfig(null, absent, found({ labels: {} })),
    code: "invalid.array",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\" must be an array.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « labels » doit être un tableau.",
  },
  {
    title: "objet attendu",
    resolve: () => resolveConfig(null, absent, found({ decorations: [] })),
    code: "invalid.object",
    level: "repo",
    en: "Invalid configuration (repository file): key \"decorations\" must be an object.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « decorations » doit être un objet.",
  },
  {
    title: "tableau de chaînes attendu",
    resolve: () => resolveConfig(null, absent, found({ exemptUsers: [1] })),
    code: "invalid.string-array",
    level: "repo",
    en: "Invalid configuration (repository file): key \"exemptUsers\" must be an array of strings.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « exemptUsers » doit être un tableau de chaînes.",
  },
  {
    title: "chaîne non vide attendue",
    resolve: () => resolveConfig(null, absent, found({ badgeStyle: '' })),
    code: "invalid.non-empty-string",
    level: "repo",
    en: "Invalid configuration (repository file): key \"badgeStyle\" must be a non-empty string.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « badgeStyle » doit être une chaîne non vide.",
  },
  {
    title: "chaîne ou null attendue",
    resolve: () => resolveConfig(null, absent, found({ language: 1 })),
    code: "invalid.string-or-null",
    level: "repo",
    en: "Invalid configuration (repository file): key \"language\" must be a string or null.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « language » doit être une chaîne ou null.",
  },
  {
    title: "version semver attendue",
    resolve: () => resolveConfig(null, absent, found({ coreMinVersion: 'x' })),
    code: "invalid.semver",
    level: "repo",
    en: "Invalid configuration (repository file): key \"coreMinVersion\" must be a semver string.",
    fr: "Configuration invalide (fichier du dépôt) : la clé « coreMinVersion » doit être une version semver.",
  },
  {
    title: "entrée de label sans id",
    resolve: () => resolveConfig(null, absent, found({ labels: [1] })),
    code: "invalid.label-entry",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\": each entry must be an object with a string \"id\".",
    fr: "Configuration invalide (fichier du dépôt) : clé « labels » : chaque entrée doit être un objet portant un « id » textuel.",
  },
  {
    title: "drapeau de label non booléen",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', enabled: 'yes' }] })),
    code: "invalid.label-boolean",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\": \"enabled\" of label \"issue\" must be a boolean.",
    fr: "Configuration invalide (fichier du dépôt) : clé « labels » : « enabled » du label « issue » doit être un booléen.",
  },
  {
    title: "propriété textuelle de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', icon: 1 }] })),
    code: "invalid.label-string",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\": \"icon\" of label \"issue\" must be a string.",
    fr: "Configuration invalide (fichier du dépôt) : clé « labels » : « icon » du label « issue » doit être une chaîne.",
  },
  {
    title: "kind de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', kind: 'x' }] })),
    code: "invalid.label-kind",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\": \"kind\" of label \"issue\" must be \"remark\" or \"reply\".",
    fr: "Configuration invalide (fichier du dépôt) : clé « labels » : « kind » du label « issue » doit valoir « remark » ou « reply ».",
  },
  {
    title: "aliases de label",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'issue', aliases: 'x' }] })),
    code: "invalid.label-aliases",
    level: "repo",
    en: "Invalid configuration (repository file): key \"labels\": \"aliases\" of label \"issue\" must be an array of strings.",
    fr: "Configuration invalide (fichier du dépôt) : clé « labels » : « aliases » du label « issue » doit être un tableau de chaînes.",
  },
  {
    title: "sous-clé booléenne",
    resolve: () => resolveConfig(null, absent, found({ decorations: { allowFree: 'x' } })),
    code: "invalid.prop-boolean",
    level: "repo",
    en: "Invalid configuration (repository file): key \"decorations\": \"allowFree\" must be a boolean.",
    fr: "Configuration invalide (fichier du dépôt) : clé « decorations » : « allowFree » doit être un booléen.",
  },
  {
    title: "sous-clé tableau",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: {} } })),
    code: "invalid.prop-array",
    level: "repo",
    en: "Invalid configuration (repository file): key \"decorations\": \"known\" must be an array.",
    fr: "Configuration invalide (fichier du dépôt) : clé « decorations » : « known » doit être un tableau.",
  },
  {
    title: "sous-clé entière",
    resolve: () => resolveConfig(null, absent, found({ rules: { minSubjectLength: -1 } })),
    code: "invalid.prop-non-negative-integer",
    level: "repo",
    en: "Invalid configuration (repository file): key \"rules\": \"minSubjectLength\" must be a non-negative integer.",
    fr: "Configuration invalide (fichier du dépôt) : clé « rules » : « minSubjectLength » doit être un entier positif ou nul.",
  },
  {
    title: "sous-clé chaîne ou null",
    resolve: () => resolveConfig(null, absent, found({ telemetry: { endpoint: 1 } })),
    code: "invalid.prop-string-or-null",
    level: "repo",
    en: "Invalid configuration (repository file): key \"telemetry\": \"endpoint\" must be a string or null.",
    fr: "Configuration invalide (fichier du dépôt) : clé « telemetry » : « endpoint » doit être une chaîne ou null.",
  },
  {
    title: "décoration sans id",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: [1] } })),
    code: "invalid.decoration-entry",
    level: "repo",
    en: "Invalid configuration (repository file): key \"decorations\": each known decoration must be an object with a string \"id\".",
    fr: "Configuration invalide (fichier du dépôt) : clé « decorations » : chaque décoration connue doit être un objet portant un « id » textuel.",
  },
  {
    title: "forces de décoration",
    resolve: () => resolveConfig(null, absent, found({ decorations: { known: [{ id: 'ui', forces: 'x' }] } })),
    code: "invalid.decoration-forces",
    level: "repo",
    en: "Invalid configuration (repository file): key \"decorations\": \"forces\" of decoration \"ui\" must be \"blocking\", \"non-blocking\" or null.",
    fr: "Configuration invalide (fichier du dépôt) : clé « decorations » : « forces » de la décoration « ui » doit valoir « blocking », « non-blocking » ou null.",
  },
  {
    title: "sévérité hors liste",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'W-X': 'loud' } })),
    code: "invalid.severity",
    level: "repo",
    en: "Invalid configuration (repository file): key \"severities\": severity of \"W-X\" must be one of off, warn, error.",
    fr: "Configuration invalide (fichier du dépôt) : clé « severities » : la sévérité de « W-X » doit valoir l’une de ces valeurs : off, warn, error.",
  },
  {
    title: "abréviations",
    resolve: () => resolveConfig(null, absent, found({ shortcuts: { abbreviations: 1 } })),
    code: "invalid.abbreviations",
    level: "repo",
    en: "Invalid configuration (repository file): key \"shortcuts\": \"abbreviations\" must be an object mapping abbreviation to inserted text.",
    fr: "Configuration invalide (fichier du dépôt) : clé « shortcuts » : « abbreviations » doit être un objet qui associe une abréviation au texte inséré.",
  },
  {
    title: "clé inconnue",
    resolve: () => resolveConfig(null, absent, found({ banana: 1 })),
    code: "config.unknown-key",
    level: "repo",
    en: "Configuration warning (repository file): unknown key \"banana\" ignored.",
    fr: "Avertissement de configuration (fichier du dépôt) : clé inconnue « banana » ignorée.",
  },
  {
    title: "clé inconnue, organisation",
    resolve: () => resolveConfig(null, found({ banana: 1 }), absent),
    code: "config.unknown-key",
    level: "org",
    en: "Configuration warning (organization configuration): unknown key \"banana\" ignored.",
    fr: "Avertissement de configuration (configuration d’organisation) : clé inconnue « banana » ignorée.",
  },
  {
    title: "clé inconnue, plancher",
    resolve: () => resolveConfig({ banana: 1 } as unknown as Floor, absent, absent),
    code: "config.unknown-key",
    level: "floor",
    en: "Configuration warning (enterprise floor): unknown key \"banana\" ignored.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé inconnue « banana » ignorée.",
  },
  {
    title: "mode « warn » obsolète",
    resolve: () => resolveConfig(null, absent, found({ mode: 'warn' })),
    code: "config.deprecated-warn",
    level: "repo",
    en: "Configuration warning (repository file): obsolete value \"warn\" for \"mode\": read as \"assist\" — replace it with \"assist\" (§7).",
    fr: "Avertissement de configuration (fichier du dépôt) : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7).",
  },
  {
    title: "minimumMode « warn » obsolète, plancher",
    resolve: () => resolveConfig({ minimumMode: 'warn' } as unknown as Floor, absent, absent),
    code: "config.deprecated-warn",
    level: "floor",
    en: "Configuration warning (enterprise floor): obsolete value \"warn\" for \"minimumMode\": read as \"assist\" — replace it with \"assist\" (§7).",
    fr: "Avertissement de configuration (plancher d’entreprise) : valeur obsolète « warn » pour « minimumMode », lue comme « assist » — remplacez-la par « assist » (§7).",
  },
  {
    title: "configUrl dans le fichier du dépôt",
    resolve: () => resolveConfig(null, absent, found({ configUrl: 'https://example.test/cc.json' })),
    code: "config.repo-config-url",
    level: "repo",
    en: "Configuration warning (repository file): \"configUrl\" is ignored here: the organization configuration URL comes exclusively from the floor channel (§8.1.2).",
    fr: "Avertissement de configuration (fichier du dépôt) : « configUrl » est ignorée ici : l’URL de la configuration d’organisation vient exclusivement du canal de plancher (§8.1.2).",
  },
  {
    title: "entrée toolCommands",
    resolve: () => resolveConfig(null, absent, found({ toolCommands: ['LGTM'] })),
    code: "config.tool-command-invalid",
    level: "repo",
    en: "Configuration warning (repository file): toolCommands entry \"LGTM\" ignored: it must be \"/*\" or an exact \"@handle\".",
    fr: "Avertissement de configuration (fichier du dépôt) : entrée « LGTM » de toolCommands ignorée : elle doit être « /* » ou un « @handle » exact.",
  },
  {
    title: "entrée toolCommands, plancher",
    resolve: () => resolveConfig({ toolCommands: { minimum: ['LGTM'] } }, absent, absent),
    code: "config.tool-command-invalid",
    level: "floor",
    en: "Configuration warning (enterprise floor): toolCommands entry \"LGTM\" ignored: it must be \"/*\" or an exact \"@handle\".",
    fr: "Avertissement de configuration (plancher d’entreprise) : entrée « LGTM » de toolCommands ignorée : elle doit être « /* » ou un « @handle » exact.",
  },
  {
    title: "trop de motifs d’allowlist",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: Array.from({ length: 51 }, (_, i) => `^p${i}$`) })),
    code: "config.allowlist-too-many",
    level: "repo",
    en: "Configuration warning (repository file): allowlist pattern #51 \"^p50$\" ignored: more than 50 patterns.",
    fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 51 « ^p50$ » ignoré : plus de 50 motifs.",
  },
  {
    title: "trop de motifs, plancher",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: Array.from({ length: 51 }, (_, i) => `^p${i}$`) } }, absent, absent),
    code: "config.allowlist-too-many",
    level: "floor",
    en: "Configuration warning (enterprise floor): allowlist pattern #51 \"^p50$\" ignored: more than 50 patterns.",
    fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 51 « ^p50$ » ignoré : plus de 50 motifs.",
  },
  {
    title: "motif d’allowlist trop long",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['a'.repeat(300)] })),
    code: "config.allowlist-too-long",
    level: "repo",
    en: "Configuration warning (repository file): allowlist pattern #1 \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…\" ignored: longer than 256 characters.",
    fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 1 « aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa… » ignoré : plus de 256 caractères.",
  },
  {
    title: "motif trop long, plancher",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['a'.repeat(300)] } }, absent, absent),
    code: "config.allowlist-too-long",
    level: "floor",
    en: "Configuration warning (enterprise floor): allowlist pattern #1 \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…\" ignored: longer than 256 characters.",
    fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 1 « aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa… » ignoré : plus de 256 caractères.",
  },
  {
    title: "quantificateurs imbriqués",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['^(a+)+$'] })),
    code: "config.allowlist-nested",
    level: "repo",
    en: "Configuration warning (repository file): allowlist pattern #1 \"^(a+)+$\" ignored: nested quantifiers are not allowed.",
    fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 1 « ^(a+)+$ » ignoré : les quantificateurs imbriqués sont interdits.",
  },
  {
    title: "quantificateurs imbriqués, plancher",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['^(a+)+$'] } }, absent, absent),
    code: "config.allowlist-nested",
    level: "floor",
    en: "Configuration warning (enterprise floor): allowlist pattern #1 \"^(a+)+$\" ignored: nested quantifiers are not allowed.",
    fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 1 « ^(a+)+$ » ignoré : les quantificateurs imbriqués sont interdits.",
  },
  {
    title: "expression régulière invalide",
    resolve: () => resolveConfig(null, absent, found({ allowlistPatterns: ['('] })),
    code: "config.allowlist-invalid",
    level: "repo",
    en: "Configuration warning (repository file): allowlist pattern #1 \"(\" ignored: invalid regular expression.",
    fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 1 « ( » ignoré : expression régulière invalide.",
  },
  {
    title: "expression régulière invalide, plancher",
    resolve: () => resolveConfig({ allowlistPatterns: { minimum: ['('] } }, absent, absent),
    code: "config.allowlist-invalid",
    level: "floor",
    en: "Configuration warning (enterprise floor): allowlist pattern #1 \"(\" ignored: invalid regular expression.",
    fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 1 « ( » ignoré : expression régulière invalide.",
  },
  {
    title: "sévérité E- relevée",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'E-NO-LABEL': 'off' } })),
    code: "config.severity-raised",
    level: "repo",
    en: "Configuration warning (repository file): severity of \"E-NO-LABEL\" cannot go below \"warn\" (§8.2): value \"off\" raised to \"warn\".",
    fr: "Avertissement de configuration (fichier du dépôt) : la sévérité de « E-NO-LABEL » ne peut pas descendre sous « warn » (§8.2) : la valeur « off » est relevée à « warn ».",
  },
  {
    title: "sévérité E- relevée, organisation",
    resolve: () => resolveConfig(null, found({ severities: { 'E-NO-LABEL': 'off' } }), absent),
    code: "config.severity-raised",
    level: "org",
    en: "Configuration warning (organization configuration): severity of \"E-NO-LABEL\" cannot go below \"warn\" (§8.2): value \"off\" raised to \"warn\".",
    fr: "Avertissement de configuration (configuration d’organisation) : la sévérité de « E-NO-LABEL » ne peut pas descendre sous « warn » (§8.2) : la valeur « off » est relevée à « warn ».",
  },
  {
    title: "sévérité du marqueur de session plafonnée",
    resolve: () => resolveConfig(null, absent, found({ severities: { 'W-SESSION-MULTIPLE': 'error' } })),
    code: "config.session-severity-capped",
    level: "repo",
    en: "Configuration warning (repository file): severity of \"W-SESSION-MULTIPLE\" cannot go above \"warn\" (§3.6): value \"error\" lowered to \"warn\".",
    fr: "Avertissement de configuration (fichier du dépôt) : la sévérité de « W-SESSION-MULTIPLE » ne peut pas dépasser « warn » (§3.6) : la valeur « error » est ramenée à « warn ».",
  },
  {
    title: "sévérité du marqueur de session plafonnée, plancher",
    resolve: () => resolveConfig({ severities: { 'W-SESSION-MULTIPLE': 'error' } }, absent, absent),
    code: "config.session-severity-capped",
    level: "floor",
    en: "Configuration warning (enterprise floor): severity of \"W-SESSION-MULTIPLE\" cannot go above \"warn\" (§3.6): value \"error\" lowered to \"warn\".",
    fr: "Avertissement de configuration (plancher d’entreprise) : la sévérité de « W-SESSION-MULTIPLE » ne peut pas dépasser « warn » (§3.6) : la valeur « error » est ramenée à « warn ».",
  },
  {
    title: "identifiants égaux à la casse près",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'Issue' }] })),
    code: "config.label-case-duplicate",
    level: "merged",
    en: "Configuration warning (merged configuration): label \"Issue\" ignored: its id differs from label \"issue\" only by case (§8.2).",
    fr: "Avertissement de configuration (configuration fusionnée) : label « Issue » ignoré : son identifiant ne diffère de celui du label « issue » que par la casse (§8.2).",
  },
  {
    title: "alias qui reprend un identifiant",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'nitpick', aliases: ['issue'] }] })),
    code: "config.alias-is-id",
    level: "merged",
    en: "Configuration warning (merged configuration): alias \"issue\" removed from label \"nitpick\": it is the id of label \"issue\" (§8.2).",
    fr: "Avertissement de configuration (configuration fusionnée) : alias « issue » retiré du label « nitpick » : c’est l’identifiant du label « issue » (§8.2).",
  },
  {
    title: "alias partagé",
    resolve: () => resolveConfig(null, absent, found({ labels: [{ id: 'aaa', aliases: ['zz'] }, { id: 'bbb', aliases: ['zz'] }] })),
    code: "config.alias-shared",
    level: "merged",
    en: "Configuration warning (merged configuration): alias \"zz\" removed from label \"aaa\": it is also an alias of \"bbb\" (§8.2).",
    fr: "Avertissement de configuration (configuration fusionnée) : alias « zz » retiré du label « aaa » : c’est aussi un alias de \"bbb\" (§8.2).",
  },
  {
    title: "plancher : tableau de chaînes attendu",
    resolve: () => resolveConfig({ exemptUsers: { closed: true } } as unknown as Floor, absent, absent),
    code: "floor.string-array",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"exemptUsers.minimum\" ignored: expected an array of strings.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « exemptUsers.minimum » ignorée : un tableau de chaînes est attendu.",
  },
  {
    title: "plancher : UNE entrée non textuelle",
    resolve: () => resolveConfig({ exemptUsers: { minimum: ['a', 1] } } as unknown as Floor, absent, absent),
    code: "floor.non-string-entry",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"exemptUsers.minimum\": 1 non-string entry ignored.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « exemptUsers.minimum » : 1 entrée non textuelle ignorée.",
  },
  {
    title: "plancher : PLUSIEURS entrées non textuelles",
    resolve: () => resolveConfig({ exemptUsers: { minimum: ['a', 1, null] } } as unknown as Floor, absent, absent),
    code: "floor.non-string-entries",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"exemptUsers.minimum\": 2 non-string entries ignored.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « exemptUsers.minimum » : 2 entrées non textuelles ignorées.",
  },
  {
    title: "plancher : closed non booléen",
    resolve: () => resolveConfig({ exemptUsers: { minimum: [], closed: 'true' } } as unknown as Floor, absent, absent),
    code: "floor.closed-not-boolean",
    level: "floor",
    en: "Configuration warning (enterprise floor): rule \"exemptUsers.closed\" is not a boolean: the list is kept closed.",
    fr: "Avertissement de configuration (plancher d’entreprise) : la règle « exemptUsers.closed » n’est pas un booléen : la liste reste fermée.",
  },
  {
    title: "plancher : entier positif ou nul",
    resolve: () => resolveConfig({ configCacheTtlSeconds: -1 }, absent, absent),
    code: "floor.non-negative-integer",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"configCacheTtlSeconds\" ignored: it must be a non-negative integer.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « configCacheTtlSeconds » ignorée : elle doit être un entier positif ou nul.",
  },
  {
    title: "plancher : valeur hors liste",
    resolve: () => resolveConfig({ minimumMode: 'x' } as unknown as Floor, absent, absent),
    code: "floor.one-of",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"minimumMode\" ignored: it must be one of off, assist, enforce.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « minimumMode » ignorée : elle doit valoir l’une de ces valeurs : off, assist, enforce.",
  },
  {
    title: "plancher : objet attendu",
    resolve: () => resolveConfig({ rules: 1 } as unknown as Floor, absent, absent),
    code: "floor.object",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"rules\" ignored: it must be an object.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « rules » ignorée : elle doit être un objet.",
  },
  {
    title: "plancher : chaîne ou null attendue",
    resolve: () => resolveConfig({ configUrl: 1 } as unknown as Floor, absent, absent),
    code: "floor.string-or-null",
    level: "floor",
    en: "Configuration warning (enterprise floor): key \"configUrl\" ignored: it must be a string or null.",
    fr: "Avertissement de configuration (plancher d’entreprise) : clé « configUrl » ignorée : elle doit être une chaîne ou null.",
  },
  {
    title: "plancher : sévérité hors liste",
    resolve: () => resolveConfig({ severities: { 'W-X': 'loud' } } as unknown as Floor, absent, absent),
    code: "floor.severity",
    level: "floor",
    en: "Configuration warning (enterprise floor): severity of \"W-X\" ignored: it must be one of off, warn, error.",
    fr: "Avertissement de configuration (plancher d’entreprise) : sévérité de « W-X » ignorée : elle doit valoir l’une de ces valeurs : off, warn, error.",
  },
  {
    title: "version de schéma",
    resolve: () => resolveConfig(null, absent, found({ version: 99 })),
    code: "unsupported.schema-version",
    level: "repo",
    en: "Unsupported version (repository file): configuration schema version 99 exceeds supported version 1: falling back to assist mode (or the floor if stricter).",
    fr: "Version non prise en charge (fichier du dépôt) : la version de schéma 99 dépasse la version prise en charge, 1 : repli en mode assist (ou sur le plancher s’il est plus strict).",
  },
  {
    title: "version de schéma, organisation",
    resolve: () => resolveConfig(null, found({ version: 99 }), absent),
    code: "unsupported.schema-version",
    level: "org",
    en: "Unsupported version (organization configuration): configuration schema version 99 exceeds supported version 1: falling back to assist mode (or the floor if stricter).",
    fr: "Version non prise en charge (configuration d’organisation) : la version de schéma 99 dépasse la version prise en charge, 1 : repli en mode assist (ou sur le plancher s’il est plus strict).",
  },
  {
    title: "coreMinVersion",
    resolve: () => resolveConfig(null, absent, found({ coreMinVersion: '9.0.0' })),
    code: "unsupported.core-version",
    level: "repo",
    en: "Unsupported version (repository file): coreMinVersion 9.0.0 requires core/ major 9, this component runs 1: falling back to assist mode (or the floor if stricter).",
    fr: "Version non prise en charge (fichier du dépôt) : coreMinVersion 9.0.0 exige la version majeure 9 de core/, ce composant exécute la 1 : repli en mode assist (ou sur le plancher s’il est plus strict).",
  },
  {
    title: "version de plancher",
    resolve: () => resolveConfig({ floorVersion: 99 }, absent, absent),
    code: "unsupported.floor-version",
    level: "floor",
    en: "Unsupported version (enterprise floor): floor version 99 exceeds supported version 1: the floor is not applied and the component falls back to assist mode (§8.1.1).",
    fr: "Version non prise en charge (plancher d’entreprise) : la version de plancher 99 dépasse la version prise en charge, 1 : le plancher n’est pas appliqué et le composant se replie en mode assist (§8.1.1).",
  },
];

describe('§5.3, §10 — le texte exact de chaque avis de configuration, en français et en anglais', () => {
  it.each(CASES)('$code ($level) — $title', ({ resolve, code, level, en, fr }) => {
    const notice = resolve().notices.find((n) => n.code === code && n.params['level'] === level);
    expect(notice, `${code} (${level})`).toBeDefined();
    expect(texts(notice!)).toEqual({ en, fr });
    // `message` est l'anglais du même catalogue — ce qu'un journal ou un test lit.
    expect(notice!.message).toBe(en);
  });

  it('chaque clé `notice.*` des catalogues a son cas ci-dessus, et chaque niveau aussi', () => {
    const keys = Object.keys(EN).filter((k) => k.startsWith('notice.')).map((k) => k.slice('notice.'.length));
    expect([...new Set(CASES.map((c) => c.code))].sort()).toEqual(keys.filter((k) => !k.startsWith('level.')).sort());
    expect([...new Set(CASES.map((c) => `level.${c.level}`))].sort()).toEqual(keys.filter((k) => k.startsWith('level.')).sort());
  });
});

describe('§5.3 — un avis cite le niveau de configuration en cause', () => {
  it('la même faute dans l’organisation ET dans le dépôt donne deux avis distincts, chacun nommant son niveau', () => {
    const { notices } = resolveConfig(null, found({ mode: 'warn' }), found({ mode: 'warn' }));
    const warns = notices.filter((n) => n.code === 'config.deprecated-warn');
    expect(warns.map(texts)).toEqual([
      { en: "Configuration warning (organization configuration): obsolete value \"warn\" for \"mode\": read as \"assist\" — replace it with \"assist\" (§7).", fr: "Avertissement de configuration (configuration d’organisation) : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7)." },
      { en: "Configuration warning (repository file): obsolete value \"warn\" for \"mode\": read as \"assist\" — replace it with \"assist\" (§7).", fr: "Avertissement de configuration (fichier du dépôt) : valeur obsolète « warn » pour « mode », lue comme « assist » — remplacez-la par « assist » (§7)." },
    ]);
  });

  it('chaque avis d’un document porte un niveau — aucun chemin ne l’oublie', () => {
    const all = CASES.flatMap((c) => c.resolve().notices);
    expect(all.filter((n) => typeof n.params['level'] !== 'string')).toEqual([]);
  });
});

describe('§8.2 — un motif d’allowlist écarté est cité par sa position et son texte borné', () => {
  // Plusieurs motifs rejetés dans la même liste, dont un très long et un qui porte un retour à
  // la ligne : la position les distingue, la citation est tronquée à 40 caractères (marque
  // d'élision comprise) et le caractère de contrôle neutralisé.
  const PATTERNS = ['^ok$', '^(a+)+$', '(\n', 'a'.repeat(300)];
  const expected = (level: string) => [
    level === 'repo' ? { en: "Configuration warning (repository file): allowlist pattern #2 \"^(a+)+$\" ignored: nested quantifiers are not allowed.", fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 2 « ^(a+)+$ » ignoré : les quantificateurs imbriqués sont interdits." } : { en: "Configuration warning (enterprise floor): allowlist pattern #2 \"^(a+)+$\" ignored: nested quantifiers are not allowed.", fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 2 « ^(a+)+$ » ignoré : les quantificateurs imbriqués sont interdits." },
    level === 'repo' ? { en: "Configuration warning (repository file): allowlist pattern #3 \"(\uFFFD\" ignored: invalid regular expression.", fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 3 « (\uFFFD » ignoré : expression régulière invalide." } : { en: "Configuration warning (enterprise floor): allowlist pattern #3 \"(\uFFFD\" ignored: invalid regular expression.", fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 3 « (\uFFFD » ignoré : expression régulière invalide." },
    level === 'repo' ? { en: "Configuration warning (repository file): allowlist pattern #4 \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…\" ignored: longer than 256 characters.", fr: "Avertissement de configuration (fichier du dépôt) : motif d’allowlist n° 4 « aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa… » ignoré : plus de 256 caractères." } : { en: "Configuration warning (enterprise floor): allowlist pattern #4 \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…\" ignored: longer than 256 characters.", fr: "Avertissement de configuration (plancher d’entreprise) : motif d’allowlist n° 4 « aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa… » ignoré : plus de 256 caractères." },
  ];
  const rejected = (notices: Notice[]) => notices.filter((n) => n.code.startsWith('config.allowlist-')).map(texts);

  it('dans le fichier du dépôt', () => {
    const { config, notices } = resolveConfig(null, absent, found({ allowlistPatterns: PATTERNS }));
    expect(config.allowlistPatterns).toEqual(['^ok$']);
    expect(rejected(notices)).toEqual(expected('repo'));
  });

  it('dans le plancher', () => {
    const { notices } = resolveConfig({ allowlistPatterns: { minimum: PATTERNS } }, absent, absent);
    expect(rejected(notices)).toEqual(expected('floor'));
  });
});

describe('§8.1.1, CA-24 — `floor-override` nomme le niveau qui a écrit la clé ignorée', () => {
  const floor: Floor = { minimumMode: 'enforce' };
  const overrides = (org: ConfigRead, repo: ConfigRead) =>
    resolveConfig(floor, org, repo).notices.filter((n) => n.kind === 'floor-override');

  it('la clé écrite par l’organisation seule est attribuée à l’organisation', () => {
    const [n, ...rest] = overrides(found({ mode: 'off' }), absent);
    expect(rest).toEqual([]);
    expect(n!.params['level']).toBe('org');
    expect(noticeText('fr', n!)).not.toContain('dépôt');
    expect(noticeText('en', n!)).not.toContain('repository');
  });

  it('la clé écrite par les deux niveaux est attribuée au dépôt, dont la valeur l’emporte', () => {
    const ns = overrides(found({ mode: 'off' }), found({ mode: 'off' }));
    expect(ns.map((n) => n.params['level'])).toEqual(['repo']);
  });

  it('la clé de l’organisation que le dépôt durcit ne produit aucun avis', () => {
    expect(overrides(found({ mode: 'off' }), found({ mode: 'enforce' }))).toEqual([]);
  });

  it('une liste `closed` : un avis par niveau dont une entrée est écartée', () => {
    const closed: Floor = { exemptUsers: { minimum: [], closed: true } };
    const levels = (org: ConfigRead, repo: ConfigRead) =>
      resolveConfig(closed, org, repo).notices.filter((n) => n.kind === 'floor-override').map((n) => n.params['level']);
    expect(levels(found({ exemptUsers: ['bot'] }), absent)).toEqual(['org']);
    expect(levels(absent, found({ exemptUsers: ['bot'] }))).toEqual(['repo']);
    expect(levels(found({ exemptUsers: ['a'] }), found({ exemptUsers: ['b'] }))).toEqual(['org', 'repo']);
  });
});
