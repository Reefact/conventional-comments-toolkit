// packages/action/src/main.ts
import { readFileSync, appendFileSync } from "node:fs";

// packages/action/src/dispatch.ts
var MATRIX_LIMIT = 256;
function dispatchSlice(items, runIndex2, limit = MATRIX_LIMIT) {
  if (limit <= 0) throw new Error(`limit must be positive, got ${limit}`);
  if (items.length <= limit) return items;
  const slices = Math.ceil(items.length / limit);
  const index = (Math.trunc(runIndex2) % slices + slices) % slices;
  return items.slice(index * limit, index * limit + limit);
}

// packages/core/dist/version.js
var CORE_VERSION = "1.0.0";
var CORE_MAJOR = 1;
var SUPPORTED_CONFIG_VERSION = 1;
var SUPPORTED_FLOOR_VERSION = 1;
var SUMMARY_PREFIX = "cc/1";

// packages/core/dist/preprocess.js
var FENCE_RE = /^\s*(`{3,}|~{3,})/;
var QUOTE_RE = /^\s*>/;
var EDGE_STRIP_RE = /^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu;
var INNER_WS_RE = /(?![ \t])[\p{White_Space}]/gu;
var BOM_RE = /\uFEFF/g;
function splitBody(body) {
  const lines = body.split(/\r?\n/);
  const discardedIndexes = /* @__PURE__ */ new Set();
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence !== null) {
      discardedIndexes.add(i);
      const m2 = FENCE_RE.exec(line);
      if (m2 && m2[1].startsWith(fence[0]) && m2[1].length >= fence.length)
        fence = null;
      continue;
    }
    const m = FENCE_RE.exec(line);
    if (m) {
      fence = m[1];
      discardedIndexes.add(i);
      continue;
    }
    if (QUOTE_RE.test(line)) {
      discardedIndexes.add(i);
    }
  }
  let prefixLineIndex = null;
  for (let i = 0; i < lines.length; i++) {
    if (discardedIndexes.has(i))
      continue;
    if (lines[i].trim() !== "") {
      prefixLineIndex = i;
      break;
    }
  }
  const rawPrefixLine = prefixLineIndex === null ? null : lines[prefixLineIndex];
  const prefixLine = rawPrefixLine === null ? null : normalizePrefixLine(rawPrefixLine);
  return { lines, discardedIndexes, prefixLineIndex, rawPrefixLine, prefixLine };
}
function normalizePrefixLine(line) {
  let s = line.replace(EDGE_STRIP_RE, "");
  s = s.replace(INNER_WS_RE, " ");
  s = s.replace(BOM_RE, "");
  return s;
}
function hasDiscussion(split) {
  for (let i = 0; i < split.lines.length; i++) {
    if (i === split.prefixLineIndex)
      continue;
    if (split.lines[i].trim() !== "")
      return true;
  }
  return false;
}
function hasOwnContent(split) {
  for (let i = 0; i < split.lines.length; i++) {
    if (split.discardedIndexes.has(i))
      continue;
    if (split.lines[i].trim() !== "")
      return true;
  }
  return false;
}
function containsSuggestionBlock(body, infoString) {
  if (infoString === null)
    return false;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*(?:`{3,}|~{3,})\s*(\S+)?\s*$/.exec(line);
    if (m && m[1] === infoString)
      return true;
  }
  return false;
}

// packages/core/dist/regex.js
var EMOJI_TOKEN_SOURCE = "(?:\\p{RI}\\p{RI}|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic}\\uFE0F?)*)";
var REFERENCE_REGEX_SOURCE = `^(?:${EMOJI_TOKEN_SOURCE}[ \\t]*)?(?<label>[A-Za-z]+)(?:[ \\t]*\\((?<decorations>[^)\\r\\n]*)\\))?:(?:[ \\t]+(?<subject>.*?)[ \\t]*)?$`;
var REFERENCE_REGEX_FLAGS = "u";
var REFERENCE_REGEX = new RegExp(REFERENCE_REGEX_SOURCE, REFERENCE_REGEX_FLAGS);
function matchPrefix(line) {
  const m = REFERENCE_REGEX.exec(line);
  if (!m || !m.groups)
    return null;
  const label2 = m.groups["label"];
  const decorations = m.groups["decorations"] ?? null;
  const subject = m.groups["subject"] ?? null;
  const labelStart = line.indexOf(label2, 0);
  const emoji = labelStart > 0 ? line.slice(0, labelStart).trimEnd() || null : null;
  let missingSpaceBeforeParen = false;
  if (decorations !== null) {
    const parenIdx = line.indexOf("(", labelStart + label2.length);
    missingSpaceBeforeParen = parenIdx === labelStart + label2.length;
  }
  return { emoji, label: label2, decorations, subject, missingSpaceBeforeParen };
}

// packages/core/dist/parser.js
var IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9-]*$/;
function parseDecorations(raw) {
  const result = { rawElements: [], canonical: [], syntaxIssues: [], styleIssues: [] };
  if (raw.trim() === "") {
    result.syntaxIssues.push({ kind: "empty-parens", element: raw });
    return result;
  }
  const rawElements = raw.split(",");
  result.rawElements = rawElements;
  const caseOffenders = [];
  let borderSpaces = false;
  const seen = /* @__PURE__ */ new Map();
  const duplicates = [];
  for (let i = 0; i < rawElements.length; i++) {
    const rawEl = rawElements[i];
    const trimmed = rawEl.trim();
    if (trimmed === "") {
      result.syntaxIssues.push({ kind: "empty-element", element: rawEl });
      continue;
    }
    if (!IDENTIFIER_RE.test(trimmed)) {
      if (/^[A-Za-z0-9-]+(?: +[A-Za-z0-9-]+)+$/.test(trimmed)) {
        result.syntaxIssues.push({ kind: "internal-space", element: trimmed });
      } else {
        result.syntaxIssues.push({ kind: "invalid-chars", element: trimmed });
      }
      continue;
    }
    const canonical = trimmed.toLowerCase();
    result.canonical.push(canonical);
    if (trimmed !== canonical)
      caseOffenders.push(trimmed);
    const leading = rawEl.length - rawEl.trimStart().length;
    const trailing = rawEl.length - rawEl.trimEnd().length;
    if (i === 0 && leading > 0 || trailing > 0 || i > 0 && leading > 1)
      borderSpaces = true;
    const count = seen.get(canonical) ?? 0;
    seen.set(canonical, count + 1);
    if (count === 1)
      duplicates.push(canonical);
  }
  if (caseOffenders.length > 0)
    result.styleIssues.push({ kind: "case", elements: caseOffenders });
  if (borderSpaces)
    result.styleIssues.push({ kind: "border-spaces", elements: [] });
  if (duplicates.length > 0)
    result.styleIssues.push({ kind: "duplicate", elements: duplicates });
  return result;
}
function resolveLabel(input2, config) {
  const lower = input2.toLowerCase();
  for (const label2 of config.labels) {
    if (!label2.enabled)
      continue;
    if (label2.id.toLowerCase() === lower)
      return { label: label2, matchedForm: label2.id, viaAlias: false };
    for (const alias of label2.aliases) {
      if (alias.toLowerCase() === lower)
        return { label: label2, matchedForm: alias, viaAlias: true };
    }
  }
  return null;
}
function enabledLabels(config) {
  return config.labels.filter((l) => l.enabled);
}
function resolveDecoration(canonical, config) {
  for (const d of config.decorations.known) {
    if (d.id.toLowerCase() === canonical)
      return d;
  }
  return null;
}
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
function closestLabel(input2, config) {
  const lower = input2.toLowerCase();
  let best = null;
  let bestDist = 3;
  for (const label2 of enabledLabels(config)) {
    const d = levenshtein(lower, label2.id.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = label2.id;
    }
    for (const alias of label2.aliases) {
      const da = levenshtein(lower, alias.toLowerCase());
      if (da < bestDist) {
        bestDist = da;
        best = alias;
      }
    }
  }
  return best;
}

// packages/core/dist/i18n/en.js
var en = {
  // Diagnostics — préfixe (§3.5.1)
  "diag.E-NO-LABEL": 'This comment does not start with a Conventional Comments prefix. Expected format: "label: subject" \u2014 e.g. "issue: this name is ambiguous".',
  "diag.E-MALFORMED-PREFIX.unclosed-paren": 'Malformed prefix: the opening parenthesis is never closed. Close the decoration list, e.g. "{fix}".',
  "diag.E-MALFORMED-PREFIX.unopened-paren": 'Malformed prefix: a closing parenthesis appears without an opening one. Open the decoration list, e.g. "{fix}".',
  "diag.E-MALFORMED-PREFIX.missing-colon": 'Malformed prefix: the colon after the label is missing. Write "{fix}".',
  "diag.E-MALFORMED-PREFIX.space-before-colon": 'Malformed prefix: no space is allowed before the colon. Write "{fix}".',
  "diag.E-MALFORMED-PREFIX.missing-space-after-colon": 'Malformed prefix: the colon must be followed by at least one space. Write "{fix}".',
  "diag.E-MALFORMED-PREFIX.unexpected-character": 'Malformed prefix: unexpected character between the label and the colon. Expected format: "label: subject" or "label (decoration): subject".',
  "diag.E-UNKNOWN-LABEL": 'Unknown label "{label}". Available labels: {labels}.{suggestion}',
  "diag.E-UNKNOWN-LABEL.suggestion": ' Did you mean "{candidate}:"?',
  "diag.W-CASE": 'Label written as "{label}" \u2014 the canonical form is "{canonical}".',
  // Diagnostics — décorations (§3.3)
  "diag.E-DECORATION-SYNTAX": "Malformed decoration(s): {details}.",
  "diag.E-DECORATION-SYNTAX.empty-parens": "empty parentheses",
  "diag.E-DECORATION-SYNTAX.empty-element": "empty element",
  "diag.E-DECORATION-SYNTAX.invalid-chars": '"{element}" contains characters outside [A-Za-z][A-Za-z0-9-]*',
  "diag.E-DECORATION-SYNTAX.internal-space": '"{element}" contains an internal space',
  "diag.E-UNKNOWN-DECORATION": "Unknown decoration(s): {elements}. Known decorations: {known}. Free decorations are disabled by configuration.",
  "diag.E-CONFLICT.label": 'The label "{label}" is always non-blocking and cannot carry the "(blocking)" decoration.',
  "diag.E-CONFLICT.decorations": "Contradictory decorations: {elements}. Keep only one of them.",
  "diag.W-DECORATION-STYLE": 'Decoration style: {details}. Canonical form: "{fix}".',
  "diag.W-DECORATION-STYLE.case": "non-canonical case on {elements}",
  "diag.W-DECORATION-STYLE.border-spaces": "superfluous spaces inside the parentheses",
  "diag.W-DECORATION-STYLE.missing-space-before-paren": "missing space before the opening parenthesis",
  "diag.W-DECORATION-STYLE.duplicate": "duplicate decoration {elements}",
  // Diagnostics — sujet
  "diag.E-EMPTY-SUBJECT": "No subject after the colon. Add a one-line summary.",
  "diag.E-DECISION-SUBJECT": 'A "decision" reply must state its rationale in at least {min} characters (currently {len}).',
  "diag.W-SUBJECT-TOO-SHORT": "Subject shorter than {min} characters.",
  "diag.W-SUBJECT-TOO-LONG": "Subject longer than {max} characters.",
  // Diagnostics — discussion et contexte
  "diag.W-NO-DISCUSSION": "This comment is blocking but has no discussion: explain why the point must be addressed.",
  "diag.W-MISSING-DECORATION": 'A "{label}" without a carrying decoration is ambiguous: add "(blocking)", "(non-blocking)" or "(if-minor)".',
  "diag.W-NOT-BLOCKABLE": "This label is blocking, but this area cannot hold a resolvable thread \u2014 it will not block completion.",
  // Sortie du check (§6.3.1)
  "headline": "{threads} unresolved blocking thread(s), {comments} non-compliant comment(s), {warnings} warning(s).",
  "headline.out-of-scope.before-activation": "PR created before activation ({activatedAt}) \u2014 not in scope.",
  "headline.out-of-scope.no-activation-date": "Activation not dated \u2014 no PR is in scope.",
  "headline.draft": "Draft PR \u2014 informative status only.",
  "headline.exempted": "PR exempted by {by} on {at}.",
  "headline.invalid-config": "Invalid configuration: {detail}",
  "headline.activation-undated": "No configuration level dates this repository\u2019s activation.",
  "headline.read-failed": "Evaluation impossible: {detail}. The check fails rather than letting a stale status decide (\xA76.4).",
  // Notices (§6.3.1)
  "notice.resolution-refused": 'Resolution of blocking thread {ref} refused: {cause}. Reopen the thread and have it resolved by the root author, or post a valid "decision" reply.',
  "notice.resolution-refused.not-author": 'resolved by {login}, who is not the root comment author, and no valid "decision" reply is present',
  "notice.resolution-refused.decision-missing": 'resolved by an authorized member but the thread contains no valid "decision" reply',
  "notice.resolution-unattributed": "Resolution of thread {ref} accepted without a known resolver: this platform does not expose who resolved a thread. The governance rule of \xA76.1 is not enforced here.",
  "notice.floor-override": 'Repository configuration key "{ref}" ignored: it would relax the enterprise floor.',
  "notice.invalid-config": "Invalid configuration: {detail}",
  "notice.config-warning": "{detail}",
  "notice.activation-undated": "No configuration level resolves activation.activatedAt: the repository is dated neither by its own file, nor by the organisation\u2019s, nor by the floor. A neutral status is published, whatever the mode (\xA78.1.5).",
  "notice.exemption-reset": "PR exemption reset: a new blocking thread appeared. The label was removed and criterion 2 applies again.",
  "notice.exemption-refused": "Exemption label posted by {login}, who is not a member of resolverOverrideGroup: the exemption is refused and the label is left in place.",
  "notice.unsupported-version": "{detail}",
  "notice.read-failed": "Read failed: {detail}. The check fails rather than letting a stale status decide (\xA76.4).",
  // Sortie humaine du statut (§6.3.1) — sa langue suit la règle du §8.1, comme le reste
  "output.unresolved-blocking-threads": "Unresolved blocking threads",
  "output.format-diagnostics": "Format diagnostics",
  "output.notices": "Reported facts",
  "output.fix": "fix",
  "output.doc-link": "Convention documentation",
  "output.empty-body": "(empty)",
  // Divers
  "and": "and"
};

// packages/core/dist/i18n/fr.js
var fr = {
  // Diagnostics — préfixe (§3.5.1)
  "diag.E-NO-LABEL": "Ce commentaire ne commence pas par un pr\xE9fixe Conventional Comments. Format attendu : \xAB label: sujet \xBB \u2014 par exemple \xAB issue: le nom est ambigu \xBB.",
  "diag.E-MALFORMED-PREFIX.unclosed-paren": "Pr\xE9fixe mal form\xE9 : la parenth\xE8se ouvrante n\u2019est jamais referm\xE9e. Refermez la liste de d\xE9corations, par exemple \xAB {fix} \xBB.",
  "diag.E-MALFORMED-PREFIX.unopened-paren": "Pr\xE9fixe mal form\xE9 : une parenth\xE8se fermante appara\xEEt sans parenth\xE8se ouvrante. Ouvrez la liste de d\xE9corations, par exemple \xAB {fix} \xBB.",
  "diag.E-MALFORMED-PREFIX.missing-colon": "Pr\xE9fixe mal form\xE9 : le deux-points apr\xE8s le label est manquant. \xC9crivez \xAB {fix} \xBB.",
  "diag.E-MALFORMED-PREFIX.space-before-colon": "Pr\xE9fixe mal form\xE9 : aucune espace n\u2019est admise avant le deux-points. \xC9crivez \xAB {fix} \xBB.",
  "diag.E-MALFORMED-PREFIX.missing-space-after-colon": "Pr\xE9fixe mal form\xE9 : le deux-points doit \xEAtre suivi d\u2019au moins une espace. \xC9crivez \xAB {fix} \xBB.",
  "diag.E-MALFORMED-PREFIX.unexpected-character": "Pr\xE9fixe mal form\xE9 : caract\xE8re inattendu entre le label et le deux-points. Format attendu : \xAB label: sujet \xBB ou \xAB label (d\xE9coration): sujet \xBB.",
  "diag.E-UNKNOWN-LABEL": "Label inconnu \xAB {label} \xBB. Labels disponibles : {labels}.{suggestion}",
  "diag.E-UNKNOWN-LABEL.suggestion": " Vouliez-vous \xE9crire \xAB {candidate}: \xBB ?",
  "diag.W-CASE": "Label saisi \xAB {label} \xBB \u2014 la forme canonique est \xAB {canonical} \xBB.",
  // Diagnostics — décorations (§3.3)
  "diag.E-DECORATION-SYNTAX": "D\xE9coration(s) mal form\xE9e(s) : {details}.",
  "diag.E-DECORATION-SYNTAX.empty-parens": "parenth\xE8ses vides",
  "diag.E-DECORATION-SYNTAX.empty-element": "\xE9l\xE9ment vide",
  "diag.E-DECORATION-SYNTAX.invalid-chars": "\xAB {element} \xBB contient des caract\xE8res hors de [A-Za-z][A-Za-z0-9-]*",
  "diag.E-DECORATION-SYNTAX.internal-space": "\xAB {element} \xBB contient une espace interne",
  "diag.E-UNKNOWN-DECORATION": "D\xE9coration(s) inconnue(s) : {elements}. D\xE9corations connues : {known}. Les d\xE9corations libres sont d\xE9sactiv\xE9es par la configuration.",
  "diag.E-CONFLICT.label": "Le label \xAB {label} \xBB est toujours non bloquant et ne peut pas porter la d\xE9coration \xAB (blocking) \xBB.",
  "diag.E-CONFLICT.decorations": "D\xE9corations contradictoires : {elements}. N\u2019en gardez qu\u2019une.",
  "diag.W-DECORATION-STYLE": "Style de d\xE9coration : {details}. Forme canonique : \xAB {fix} \xBB.",
  "diag.W-DECORATION-STYLE.case": "casse non canonique sur {elements}",
  "diag.W-DECORATION-STYLE.border-spaces": "espaces superflues \xE0 l\u2019int\xE9rieur des parenth\xE8ses",
  "diag.W-DECORATION-STYLE.missing-space-before-paren": "espace manquante avant la parenth\xE8se ouvrante",
  "diag.W-DECORATION-STYLE.duplicate": "d\xE9coration en doublon {elements}",
  // Diagnostics — sujet
  "diag.E-EMPTY-SUBJECT": "Aucun sujet apr\xE8s le deux-points. Ajoutez un r\xE9sum\xE9 sur une ligne.",
  "diag.E-DECISION-SUBJECT": "Une r\xE9ponse \xAB decision \xBB doit \xE9noncer son motif en au moins {min} caract\xE8res (actuellement {len}).",
  "diag.W-SUBJECT-TOO-SHORT": "Sujet plus court que {min} caract\xE8res.",
  "diag.W-SUBJECT-TOO-LONG": "Sujet plus long que {max} caract\xE8res.",
  // Diagnostics — discussion et contexte
  "diag.W-NO-DISCUSSION": "Ce commentaire est bloquant mais ne comporte aucune discussion : expliquez pourquoi le point doit \xEAtre trait\xE9.",
  "diag.W-MISSING-DECORATION": "Un \xAB {label} \xBB sans d\xE9coration porteuse est ambigu : ajoutez \xAB (blocking) \xBB, \xAB (non-blocking) \xBB ou \xAB (if-minor) \xBB.",
  "diag.W-NOT-BLOCKABLE": "Ce label est bloquant, mais cette zone ne permet pas de r\xE9soudre un fil \u2014 il ne bloquera pas la compl\xE9tion.",
  // Sortie du check (§6.3.1)
  "headline": "{threads} fil(s) bloquant(s) non r\xE9solu(s), {comments} commentaire(s) non conforme(s), {warnings} avertissement(s).",
  "headline.out-of-scope.before-activation": "PR ant\xE9rieure \xE0 l\u2019activation ({activatedAt}) \u2014 hors p\xE9rim\xE8tre.",
  "headline.out-of-scope.no-activation-date": "Activation non dat\xE9e \u2014 aucune PR n\u2019est dans le p\xE9rim\xE8tre.",
  "headline.draft": "PR en brouillon \u2014 statut informatif uniquement.",
  "headline.exempted": "PR exempt\xE9e par {by} le {at}.",
  "headline.invalid-config": "Configuration invalide : {detail}",
  "headline.activation-undated": "Aucun niveau de configuration ne date l\u2019activation de ce d\xE9p\xF4t.",
  "headline.read-failed": "\xC9valuation impossible : {detail}. Le check \xE9choue plut\xF4t que de laisser un statut p\xE9rim\xE9 d\xE9cider (\xA76.4).",
  // Notices (§6.3.1)
  "notice.resolution-refused": "R\xE9solution du fil bloquant {ref} refus\xE9e : {cause}. Rouvrez le fil et faites-le r\xE9soudre par l\u2019auteur du commentaire racine, ou postez-y une r\xE9ponse \xAB decision \xBB valide.",
  "notice.resolution-refused.not-author": "r\xE9solu par {login}, qui n\u2019est pas l\u2019auteur du commentaire racine, et aucune r\xE9ponse \xAB decision \xBB valide n\u2019est pr\xE9sente",
  "notice.resolution-refused.decision-missing": "r\xE9solu par un membre habilit\xE9 mais le fil ne contient aucune r\xE9ponse \xAB decision \xBB valide",
  "notice.resolution-unattributed": "R\xE9solution du fil {ref} accept\xE9e sans r\xE9solveur connu : cette plateforme n\u2019expose pas qui a r\xE9solu un fil. La r\xE8gle de gouvernance du \xA76.1 n\u2019y est pas appliqu\xE9e.",
  "notice.floor-override": "Cl\xE9 de configuration de d\xE9p\xF4t \xAB {ref} \xBB ignor\xE9e : elle assouplirait le plancher d\u2019entreprise.",
  "notice.invalid-config": "Configuration invalide : {detail}",
  "notice.config-warning": "{detail}",
  "notice.activation-undated": "Aucun niveau de configuration ne r\xE9sout activation.activatedAt : le d\xE9p\xF4t n\u2019est dat\xE9 ni par son fichier, ni par celui de l\u2019organisation, ni par le plancher. Statut neutre publi\xE9, quel que soit le mode (\xA78.1.5).",
  "notice.exemption-reset": "Exemption de PR remise \xE0 z\xE9ro : un nouveau fil bloquant est apparu. L\u2019\xE9tiquette a \xE9t\xE9 retir\xE9e et le crit\xE8re 2 s\u2019applique de nouveau.",
  "notice.exemption-refused": "\xC9tiquette d\u2019exemption pos\xE9e par {login}, non membre de resolverOverrideGroup : l\u2019exemption est refus\xE9e et l\u2019\xE9tiquette est laiss\xE9e en place.",
  "notice.unsupported-version": "{detail}",
  "notice.read-failed": "Lecture impossible : {detail}. Le check \xE9choue plut\xF4t que de laisser un statut p\xE9rim\xE9 d\xE9cider (\xA76.4).",
  // Sortie humaine du statut (§6.3.1) — sa langue suit la règle du §8.1, comme le reste
  "output.unresolved-blocking-threads": "Fils bloquants non r\xE9solus",
  "output.format-diagnostics": "Diagnostics de format",
  "output.notices": "Faits signal\xE9s",
  "output.fix": "correction",
  "output.doc-link": "Documentation de la convention",
  "output.empty-body": "(vide)",
  // Divers
  "and": "et"
};

// packages/core/dist/i18n/index.js
var catalogs = { en, fr };
function resolveLang(lang) {
  if (!lang)
    return "en";
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return base === "fr" ? "fr" : "en";
}
function t(lang, key, params) {
  const catalog = catalogs[resolveLang(lang)] ?? en;
  let template = catalog[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.split(`{${k}}`).join(String(v));
    }
  }
  return template;
}

// packages/core/dist/validator.js
var DIAGNOSTIC_ORDER = [
  "E-NO-LABEL",
  "E-MALFORMED-PREFIX",
  "E-UNKNOWN-LABEL",
  "W-CASE",
  "E-DECORATION-SYNTAX",
  "E-UNKNOWN-DECORATION",
  "E-CONFLICT",
  "W-DECORATION-STYLE",
  "E-EMPTY-SUBJECT",
  "E-DECISION-SUBJECT",
  "W-SUBJECT-TOO-SHORT",
  "W-SUBJECT-TOO-LONG",
  "W-NO-DISCUSSION",
  "W-MISSING-DECORATION",
  "W-NOT-BLOCKABLE"
];
var DEFAULT_SEVERITIES = {
  "E-NO-LABEL": "error",
  "E-MALFORMED-PREFIX": "error",
  "E-UNKNOWN-LABEL": "error",
  "W-CASE": "warn",
  "E-DECORATION-SYNTAX": "error",
  "E-UNKNOWN-DECORATION": "error",
  "E-CONFLICT": "error",
  "W-DECORATION-STYLE": "warn",
  "E-EMPTY-SUBJECT": "error",
  "E-DECISION-SUBJECT": "error",
  "W-SUBJECT-TOO-SHORT": "warn",
  "W-SUBJECT-TOO-LONG": "warn",
  "W-NO-DISCUSSION": "warn",
  "W-MISSING-DECORATION": "warn",
  "W-NOT-BLOCKABLE": "warn"
};
function validate(input2, config) {
  return analyze(input2, config).diagnostics;
}
function analyze(input2, config) {
  const lang = config.language;
  const split = splitBody(input2.body);
  const suggestion = containsSuggestionBlock(input2.body, input2.platform.suggestionInfoString);
  const base = {
    outcome: "analyzed",
    diagnostics: [],
    resolved: null,
    implicitSuggestion: false,
    blocking: false,
    hadConflict: false,
    decorations: [],
    aliasRewrite: null,
    prefixLine: split.prefixLine
  };
  const zoneExcluded = input2.zone === "reply" && !config.scope.validateReplies || input2.zone === "review-body" && !config.scope.validateReviewSummary;
  if (zoneExcluded) {
    const isDecisionReply = input2.zone === "reply" && split.prefixLine !== null && (() => {
      const m = matchPrefix(split.prefixLine);
      return m !== null && resolveLabel(m.label, config)?.label.id === "decision";
    })();
    if (!isDecisionReply) {
      return { ...base, outcome: "excluded" };
    }
  }
  if (isExempt(input2, config, split, suggestion)) {
    return { ...base, outcome: "exempt" };
  }
  const prefix = recognizePrefix(input2, config, split, suggestion, lang);
  const diagnostics = [...prefix.diagnostics];
  let blocking = false;
  let hadConflict = false;
  let decorations = [];
  let aliasRewrite = null;
  if (prefix.proceed && prefix.resolved) {
    const t2 = contentControls(input2, config, split, prefix, lang);
    diagnostics.push(...t2.diagnostics);
    blocking = t2.blocking;
    hadConflict = t2.hadConflict;
    decorations = t2.decorations;
    if (prefix.resolved.viaAlias && prefix.match && split.prefixLine) {
      const canonical = prefix.resolved.label.id;
      aliasRewrite = {
        from: prefix.resolved.matchedForm,
        to: canonical,
        replacement: rebuildLine(prefix.match, { label: canonical })
      };
    }
  }
  return {
    outcome: "analyzed",
    diagnostics: finalizeDiagnostics(diagnostics, config),
    resolved: prefix.resolved,
    implicitSuggestion: prefix.implicitSuggestion,
    blocking,
    hadConflict,
    decorations,
    aliasRewrite,
    prefixLine: split.prefixLine
  };
}
function isExempt(input2, config, split, suggestion) {
  if (input2.isSystemGenerated)
    return true;
  if (input2.body.trim() === "")
    return true;
  if (input2.author) {
    const login = input2.author.login.toLowerCase();
    if (config.exemptUsers.some((u) => u.toLowerCase() === login))
      return true;
  }
  const trimmed = input2.body.trimStart();
  const firstToken = /^(\S+)/.exec(trimmed)?.[1] ?? null;
  if (firstToken) {
    const lowerToken = firstToken.toLowerCase();
    for (const entry of config.toolCommands) {
      if (entry === "/*") {
        if (/^\/[A-Za-z][A-Za-z0-9_-]*$/.test(firstToken))
          return true;
      } else if (entry.toLowerCase() === lowerToken) {
        return true;
      }
    }
  }
  const wholeTrimmed = input2.body.trim();
  for (const pattern of config.allowlistPatterns) {
    try {
      if (new RegExp(pattern).test(wholeTrimmed))
        return true;
    } catch {
    }
  }
  if (!hasOwnContent(split) && !suggestion)
    return true;
  return false;
}
function recognizePrefix(input2, config, split, suggestion, lang) {
  if (suggestion) {
    const line2 = split.prefixLine;
    const firstWord = line2 ? /^[A-Za-z]+/.exec(line2)?.[0] ?? null : null;
    const attempted = firstWord !== null && resolveLabel(firstWord, config) !== null;
    if (!attempted) {
      const suggestionLabel = config.labels.find((l) => l.id === "suggestion" && l.enabled);
      if (suggestionLabel) {
        return {
          resolved: { label: suggestionLabel, matchedForm: "suggestion", viaAlias: false },
          match: null,
          implicitSuggestion: true,
          diagnostics: [],
          proceed: true
        };
      }
    } else {
      const m2 = matchPrefix(line2);
      if (m2 !== null) {
        return stage2AndBeyond(m2, config, lang);
      }
      return {
        resolved: null,
        match: null,
        implicitSuggestion: false,
        diagnostics: [malformedPrefixDiagnostic(line2, lang)],
        proceed: false
      };
    }
  }
  const line = split.prefixLine;
  if (line === null) {
    return { resolved: null, match: null, implicitSuggestion: false, diagnostics: [], proceed: false };
  }
  const m = matchPrefix(line);
  if (m === null) {
    const firstWord = /^[A-Za-z]+/.exec(line)?.[0] ?? null;
    const attempted = firstWord !== null && resolveLabel(firstWord, config) !== null;
    const diag = attempted ? malformedPrefixDiagnostic(line, lang) : {
      code: "E-NO-LABEL",
      severity: "error",
      message: t(lang, "diag.E-NO-LABEL")
    };
    return { resolved: null, match: null, implicitSuggestion: false, diagnostics: [diag], proceed: false };
  }
  return stage2AndBeyond(m, config, lang);
}
function stage2AndBeyond(m, config, lang) {
  const resolved = resolveLabel(m.label, config);
  if (resolved === null) {
    const labels = enabledLabels(config).map((l) => l.id).join(", ");
    const candidate = closestLabel(m.label, config);
    const diag = {
      code: "E-UNKNOWN-LABEL",
      severity: "error",
      message: t(lang, "diag.E-UNKNOWN-LABEL", {
        label: m.label,
        labels,
        suggestion: candidate ? t(lang, "diag.E-UNKNOWN-LABEL.suggestion", { candidate }) : ""
      }),
      ...candidate ? { fix: { replacement: rebuildLine(m, { label: candidate }) } } : {}
    };
    return { resolved: null, match: m, implicitSuggestion: false, diagnostics: [diag], proceed: false };
  }
  const diagnostics = [];
  if (m.label !== resolved.matchedForm) {
    diagnostics.push({
      code: "W-CASE",
      severity: "warn",
      message: t(lang, "diag.W-CASE", { label: m.label, canonical: resolved.matchedForm }),
      fix: { replacement: rebuildLine(m, { label: resolved.matchedForm }) }
    });
  }
  return { resolved, match: m, implicitSuggestion: false, diagnostics, proceed: true };
}
function contentControls(input2, config, split, prefix, lang) {
  const diagnostics = [];
  const resolved = prefix.resolved;
  const m = prefix.match;
  const implicit = prefix.implicitSuggestion;
  let parsed = null;
  if (m && m.decorations !== null) {
    parsed = parseDecorations(m.decorations);
    if (parsed.syntaxIssues.length > 0) {
      const details = parsed.syntaxIssues.map((i) => t(lang, `diag.E-DECORATION-SYNTAX.${i.kind}`, { element: i.element })).join(", ");
      diagnostics.push({
        code: "E-DECORATION-SYNTAX",
        severity: "error",
        message: t(lang, "diag.E-DECORATION-SYNTAX", { details })
      });
    }
    const unknown = parsed.canonical.filter((c) => resolveDecoration(c, config) === null);
    if (unknown.length > 0 && !config.decorations.allowFree) {
      diagnostics.push({
        code: "E-UNKNOWN-DECORATION",
        severity: "error",
        message: t(lang, "diag.E-UNKNOWN-DECORATION", {
          elements: unknown.map((u) => `(${u})`).join(", "),
          known: config.decorations.known.map((d) => `(${d.id})`).join(", ")
        })
      });
    }
  }
  const canonical = parsed ? parsed.canonical : [];
  const carriers = canonical.map((c) => resolveDecoration(c, config)).filter((d) => d !== null && d.forces !== null);
  const forcesBlocking = carriers.some((d) => d.forces === "blocking");
  const forcesNonBlocking = carriers.some((d) => d.forces === "non-blocking");
  const seenForBadges = /* @__PURE__ */ new Set();
  const decorations = [];
  for (const c of canonical) {
    if (seenForBadges.has(c))
      continue;
    seenForBadges.add(c);
    const resolvedDecoration = resolveDecoration(c, config);
    if (resolvedDecoration === null && !config.decorations.allowFree)
      continue;
    decorations.push({ id: c, forces: resolvedDecoration?.forces ?? null, known: resolvedDecoration !== null });
  }
  const conflictLabel = resolved.label.alwaysNonBlocking && forcesBlocking;
  const conflictDecorations = forcesBlocking && forcesNonBlocking;
  const hadConflict = conflictLabel || conflictDecorations;
  if (hadConflict) {
    diagnostics.push({
      code: "E-CONFLICT",
      severity: "error",
      message: conflictLabel ? t(lang, "diag.E-CONFLICT.label", { label: resolved.label.id }) : t(lang, "diag.E-CONFLICT.decorations", {
        elements: carriers.map((c) => `(${c.id})`).join(" + ")
      })
    });
  }
  if (parsed && (parsed.styleIssues.length > 0 || m && m.missingSpaceBeforeParen)) {
    const details = [];
    for (const issue of parsed.styleIssues) {
      details.push(t(lang, `diag.W-DECORATION-STYLE.${issue.kind}`, {
        elements: issue.elements.map((e) => `(${e})`).join(", ")
      }));
    }
    if (m && m.missingSpaceBeforeParen) {
      details.push(t(lang, "diag.W-DECORATION-STYLE.missing-space-before-paren"));
    }
    const fix = rebuildLine(m, { label: m.label, canonicalDecorations: true });
    diagnostics.push({
      code: "W-DECORATION-STYLE",
      severity: "warn",
      message: t(lang, "diag.W-DECORATION-STYLE", { details: details.join(", "), fix }),
      fix: { replacement: fix }
    });
  }
  let blocking;
  if (hadConflict) {
    blocking = resolved.label.blockingByDefault;
  } else if (forcesBlocking) {
    blocking = true;
  } else if (forcesNonBlocking) {
    blocking = false;
  } else {
    blocking = resolved.label.blockingByDefault;
  }
  const isDecisionReply = input2.zone === "reply" && resolved.label.id === "decision";
  if (!implicit) {
    const subject = m?.subject ?? null;
    if (subject === null) {
      diagnostics.push({
        code: "E-EMPTY-SUBJECT",
        severity: "error",
        message: t(lang, "diag.E-EMPTY-SUBJECT")
      });
    } else {
      const len = [...subject].length;
      if (isDecisionReply) {
        if (len < config.rules.minDecisionSubjectLength) {
          diagnostics.push({
            code: "E-DECISION-SUBJECT",
            severity: "error",
            message: t(lang, "diag.E-DECISION-SUBJECT", {
              min: config.rules.minDecisionSubjectLength,
              len
            })
          });
        }
      } else {
        if (len < config.rules.minSubjectLength) {
          diagnostics.push({
            code: "W-SUBJECT-TOO-SHORT",
            severity: "warn",
            message: t(lang, "diag.W-SUBJECT-TOO-SHORT", { min: config.rules.minSubjectLength })
          });
        }
        if (len > config.rules.maxSubjectLength) {
          diagnostics.push({
            code: "W-SUBJECT-TOO-LONG",
            severity: "warn",
            message: t(lang, "diag.W-SUBJECT-TOO-LONG", { max: config.rules.maxSubjectLength })
          });
        }
      }
    }
  }
  if (!implicit && blocking && !hasDiscussion(split)) {
    diagnostics.push({
      code: "W-NO-DISCUSSION",
      severity: "warn",
      message: t(lang, "diag.W-NO-DISCUSSION")
    });
  }
  if (!implicit && (resolved.label.id === "suggestion" || resolved.label.id === "question") && carriers.length === 0) {
    diagnostics.push({
      code: "W-MISSING-DECORATION",
      severity: "warn",
      message: t(lang, "diag.W-MISSING-DECORATION", { label: resolved.label.id })
    });
  }
  if (blocking && !input2.canCarryBlockingState) {
    diagnostics.push({
      code: "W-NOT-BLOCKABLE",
      severity: "warn",
      message: t(lang, "diag.W-NOT-BLOCKABLE")
    });
  }
  return { diagnostics, blocking, hadConflict, decorations };
}
function malformedMotif(line) {
  const hasOpen = line.includes("(");
  const hasClose = line.includes(")");
  if (hasOpen && !hasClose)
    return "unclosed-paren";
  if (hasClose && !hasOpen)
    return "unopened-paren";
  const colon = line.indexOf(":");
  if (colon === -1)
    return "missing-colon";
  if (colon > 0 && /[ \t]/.test(line[colon - 1]))
    return "space-before-colon";
  const after = line[colon + 1];
  if (after !== void 0 && !/[ \t]/.test(after))
    return "missing-space-after-colon";
  return "unexpected-character";
}
function malformedPrefixDiagnostic(line, lang) {
  const motif = malformedMotif(line);
  const fix = malformedFix(line, motif);
  return {
    code: "E-MALFORMED-PREFIX",
    severity: "error",
    message: t(lang, `diag.E-MALFORMED-PREFIX.${motif}`, { fix: fix ?? "" }),
    ...fix ? { fix: { replacement: fix } } : {}
  };
}
function malformedFix(line, motif) {
  switch (motif) {
    case "unclosed-paren": {
      const colon = line.indexOf(":");
      if (colon === -1)
        return null;
      return line.slice(0, colon).trimEnd() + "): " + line.slice(colon + 1).trimStart();
    }
    case "unopened-paren": {
      const m = /^([A-Za-z]+)[ \t]+(.*)$/.exec(line);
      if (!m)
        return null;
      return `${m[1]} (${m[2].replace(/\)[ \t]*:/, "):")}`.replace(/ \(/, " (");
    }
    case "missing-colon": {
      const close = line.indexOf(")");
      if (close !== -1) {
        return line.slice(0, close + 1) + ":" + ensureLeadingSpace(line.slice(close + 1));
      }
      const m = /^([A-Za-z]+)[ \t]+(.*)$/.exec(line);
      if (!m)
        return null;
      return `${m[1]}: ${m[2]}`;
    }
    case "space-before-colon": {
      const colon = line.indexOf(":");
      return line.slice(0, colon).trimEnd() + line.slice(colon);
    }
    case "missing-space-after-colon": {
      const colon = line.indexOf(":");
      return line.slice(0, colon + 1) + " " + line.slice(colon + 1);
    }
    case "unexpected-character":
      return null;
  }
}
function ensureLeadingSpace(s) {
  return s.startsWith(" ") || s === "" ? s : " " + s;
}
function rebuildLine(m, opts) {
  const emoji = m.emoji ? `${m.emoji} ` : "";
  let decorations = "";
  if (m.decorations !== null) {
    if (opts.canonicalDecorations) {
      const parsed = parseDecorations(m.decorations);
      const items = [];
      const seen = /* @__PURE__ */ new Set();
      for (const rawEl of parsed.rawElements) {
        const trimmed = rawEl.trim();
        if (trimmed === "")
          continue;
        const canonical = /^[A-Za-z][A-Za-z0-9-]*$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
        if (seen.has(canonical))
          continue;
        seen.add(canonical);
        items.push(canonical);
      }
      decorations = items.length > 0 ? ` (${items.join(", ")})` : "";
    } else {
      decorations = ` (${m.decorations})`;
    }
  }
  const subject = m.subject !== null ? ` ${m.subject}` : "";
  return `${emoji}${opts.label}${decorations}:${subject}`;
}
function finalizeDiagnostics(diagnostics, config) {
  const out = [];
  for (const d of diagnostics) {
    let severity = config.severities[d.code] ?? DEFAULT_SEVERITIES[d.code] ?? (d.code.startsWith("E-") ? "error" : "warn");
    if (severity === "off" && d.code.startsWith("E-"))
      severity = "warn";
    if (severity === "off")
      continue;
    out.push({ ...d, severity });
  }
  out.sort((a, b) => DIAGNOSTIC_ORDER.indexOf(a.code) - DIAGNOSTIC_ORDER.indexOf(b.code));
  return out;
}
function isCompliant(diagnostics) {
  return diagnostics.every((d) => d.severity !== "error");
}

// packages/core/dist/config/defaults.js
var label = (id, icon, color, blockingByDefault, alwaysNonBlocking, enabled = true, aliases = [], kind = "remark") => ({ id, enabled, blockingByDefault, alwaysNonBlocking, kind, icon, color, aliases: [...aliases] });
var ADDED_LABELS = [
  label("thanks", "\u{1F91D}", "#9C8C1A", false, true, true, ["thx"], "reply"),
  label("done", "\u2705", "#6B8E23", false, true, true, ["fixed"], "reply"),
  label("ack", "\u{1F44C}", "#6A7FDB", false, true, true, ["acknowledged"], "reply"),
  label("disagree", "\u270B", "#8A7B6E", false, true, true, [], "reply"),
  label("reviewed", "\u{1F389}", "#D04A7A", false, true, true, [], "remark")
];
var added = (id) => structuredClone(ADDED_LABELS.find((l) => l.id === id));
function defaultConfig() {
  return {
    version: 1,
    mode: "assist",
    labels: [
      label("praise", "\u{1F44F}", "#36933B", false, false),
      label("nitpick", "\u{1F50D}", "#76818E", false, true),
      label("suggestion", "\u{1F4A1}", "#B07600", false, false),
      // Icône identique à celle de l'exemple normatif (.conventional-comments.example.json,
      // qui n'illustre que la FORME des clés, cf. en-tête de fichier) ; la couleur n'a en
      // revanche pas pu rester celle de l'exemple (#B3261E, ~2,00:1 au pire, cf. plus haut) —
      // l'exemple a été aligné sur celle-ci plutôt que l'inverse.
      label("issue", "\u{1F528}", "#E04E45", true, false),
      label("todo", "\u{1F4CC}", "#D95800", true, false),
      label("question", "\u2753", "#197EF5", false, false),
      label("thought", "\u{1F4AD}", "#9368E3", false, true),
      label("chore", "\u{1F9F9}", "#A97735", true, false),
      label("note", "\u{1F4DD}", "#1F8E96", false, true),
      // `typo`, `polish`, `quibble` : de Conventional Comments, longtemps livrés désactivés,
      // actifs comme tous les autres (§3.2) — une équipe désactive ceux qu'elle ne veut pas.
      label("typo", "\u{1F524}", "#CC549C", false, false),
      label("polish", "\u2728", "#0C8E9A", false, false),
      label("quibble", "\u{1FAB6}", "#61896C", false, false),
      // Labels ajoutés (§3.2) — une extension propre à cette boîte à outils, absente de
      // Conventional Comments (§3.1), livrée activée ; un dépôt qui veut s'en tenir à la liste de
      // l'amont les désactive. L'ordre de cette liste EST l'ordre par défaut des boutons (§5.1) :
      // `reviewed` clôt la zone `remark`, puis la zone `reply` va du plus conciliant au plus
      // tranché — `thanks`, `done`, `ack`, `decision`, `disagree`. `decision`, propre au produit lui aussi,
      // n'est pas un label ajouté (§3.2) : il s'intercale, il ne rejoint pas le groupe.
      added("reviewed"),
      added("thanks"),
      added("done"),
      added("ack"),
      label("decision", "\u2696\uFE0F", "#936DD4", false, true, true, [], "reply"),
      added("disagree")
    ],
    decorations: {
      allowFree: true,
      known: [
        { id: "blocking", forces: "blocking" },
        { id: "non-blocking", forces: "non-blocking" },
        { id: "if-minor", forces: "non-blocking" }
      ]
    },
    severities: {},
    scope: { validateReplies: false, validateReviewSummary: true },
    rules: { minSubjectLength: 5, maxSubjectLength: 120, minDecisionSubjectLength: 20 },
    formatSeverity: "warn",
    exemptUsers: [],
    allowlistPatterns: [],
    toolCommands: [],
    // vide par défaut — recommandation en annexe, jamais un défaut produit (§4.2)
    resolverOverrideGroup: [],
    // repli terminal — n'habilite personne (§8.2)
    overrideLabel: "cc-override",
    activation: { activatedAt: null },
    configUrl: null,
    coreMinVersion: "1.0.0",
    configCacheTtlSeconds: 3600,
    badgeStyle: "pill",
    shortcuts: {
      // §5.2 — autant de lettres qu'il en faut pour désigner un label sans ambiguïté :
      // deux pour nitpick/note, todo/thought, praise/polish ; trois pour question/quibble.
      abbreviations: {
        "?i": "issue: ",
        // Labels de réponse (§3.2, §5.2) : `?de` reste `decision`, le seul label porteur d'un
        // effet opposable. Livrées pour trois labels désactivés, elles ne se déplient que
        // lorsque leur label est actif (§5.2, `CA-47`) — c'est `quickinput.ts` qui garde.
        "?a": "ack: ",
        "?do": "done: ",
        "?di": "disagree: ",
        "?r": "reviewed: ",
        "?thx": "thanks: ",
        // comme l'alias `thx` ; `?th` est `thought` et ne se redéfinit pas (§5.2)
        "?ib": "issue (blocking): ",
        "?su": "suggestion: ",
        "?ni": "nitpick: ",
        "?no": "note: ",
        "?pr": "praise: ",
        "?to": "todo: ",
        "?th": "thought: ",
        "?que": "question: ",
        "?ch": "chore: ",
        "?de": "decision: ",
        "?ty": "typo: ",
        "?po": "polish: ",
        "?qui": "quibble: "
      }
    },
    // La page des labels du site de l'outil, et non conventionalcomments.org : celle-ci ne
    // documente aucun des labels ajoutés, actifs par défaut (§8.2, `docUrl`).
    docUrl: "https://conventionalcomments.io/docs/labels/",
    language: null,
    telemetry: { enabled: false, endpoint: null }
  };
}

// packages/core/dist/config/schema.js
var MODES = ["off", "assist", "warn", "enforce"];
var SEVERITIES = ["off", "warn", "error"];
var FORCES = ["blocking", "non-blocking", null];
var KNOWN_KEYS = /* @__PURE__ */ new Set([
  "$schema",
  "version",
  "mode",
  "labels",
  "decorations",
  "severities",
  "scope",
  "rules",
  "formatSeverity",
  "exemptUsers",
  "allowlistPatterns",
  "toolCommands",
  "resolverOverrideGroup",
  "overrideLabel",
  "activation",
  "configUrl",
  "coreMinVersion",
  "configCacheTtlSeconds",
  "badgeStyle",
  "shortcuts",
  "docUrl",
  "language",
  "telemetry"
]);
function warning(message, ref) {
  return { kind: "config-warning", message, ...ref ? { ref } : {} };
}
function invalid(message, ref) {
  return { kind: "invalid-config", message, ...ref ? { ref } : {} };
}
function faultyLine(text, error) {
  const msg = error instanceof Error ? error.message : String(error);
  const m = /position (\d+)/.exec(msg);
  if (!m)
    return void 0;
  const pos = Number(m[1]);
  const line = text.slice(0, pos).split("\n").length;
  return `line ${line}`;
}
function parseConfigDocument(text, opts) {
  const notices = [];
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const line = faultyLine(text, e);
    notices.push(invalid(`unparseable JSON${line ? ` (${line})` : ""}`, line));
    return { values: null, notices, invalid: true, unsupported: false };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    notices.push(invalid("the configuration document must be a JSON object"));
    return { values: null, notices, invalid: true, unsupported: false };
  }
  const doc = raw;
  const out = {};
  let isInvalid = false;
  let unsupported = false;
  const bad = (key, detail) => {
    notices.push(invalid(`key "${key}": ${detail}`, key));
    isInvalid = true;
  };
  for (const [key, value] of Object.entries(doc)) {
    if (!KNOWN_KEYS.has(key)) {
      notices.push(warning(`unknown configuration key "${key}" ignored`, key));
      continue;
    }
    switch (key) {
      case "$schema":
        break;
      case "version":
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
          bad(key, "must be a positive integer");
        } else if (value > SUPPORTED_CONFIG_VERSION) {
          unsupported = true;
          notices.push({
            kind: "unsupported-version",
            message: `configuration schema version ${value} exceeds supported version ${SUPPORTED_CONFIG_VERSION}: falling back to assist mode (or the floor if stricter)`,
            ref: key
          });
        } else {
          out[key] = value;
        }
        break;
      case "mode":
        if (typeof value !== "string" || !MODES.includes(value))
          bad(key, `must be one of ${MODES.join(", ")}`);
        else
          out[key] = value;
        break;
      case "formatSeverity":
        if (value !== "warn" && value !== "error")
          bad(key, 'must be "warn" or "error"');
        else
          out[key] = value;
        break;
      case "labels": {
        if (!Array.isArray(value)) {
          bad(key, "must be an array");
          break;
        }
        const labels = [];
        for (const entry of value) {
          if (entry === null || typeof entry !== "object" || typeof entry["id"] !== "string") {
            bad(key, 'each entry must be an object with a string "id"');
            continue;
          }
          const e = entry;
          const label2 = { id: e["id"] };
          let ok = true;
          for (const flag of ["enabled", "blockingByDefault", "alwaysNonBlocking"]) {
            if (flag in e) {
              if (typeof e[flag] !== "boolean") {
                bad(key, `"${flag}" of label "${e["id"]}" must be a boolean`);
                ok = false;
              } else
                label2[flag] = e[flag];
            }
          }
          for (const s of ["icon", "color"]) {
            if (s in e) {
              if (typeof e[s] !== "string") {
                bad(key, `"${s}" of label "${e["id"]}" must be a string`);
                ok = false;
              } else
                label2[s] = e[s];
            }
          }
          if ("kind" in e) {
            if (e["kind"] !== "remark" && e["kind"] !== "reply") {
              bad(key, `"kind" of label "${e["id"]}" must be "remark" or "reply"`);
              ok = false;
            } else
              label2["kind"] = e["kind"];
          }
          if ("aliases" in e) {
            if (!Array.isArray(e["aliases"]) || !e["aliases"].every((a) => typeof a === "string")) {
              bad(key, `"aliases" of label "${e["id"]}" must be an array of strings`);
              ok = false;
            } else
              label2["aliases"] = e["aliases"];
          }
          for (const k of Object.keys(e)) {
            if (!["id", "enabled", "blockingByDefault", "alwaysNonBlocking", "kind", "icon", "color", "aliases"].includes(k)) {
              notices.push(warning(`unknown key "labels[].${k}" ignored`, `labels[].${k}`));
            }
          }
          if (ok)
            labels.push(label2);
        }
        out[key] = labels;
        break;
      }
      case "decorations": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const d = value;
        const decorations = {};
        if ("allowFree" in d) {
          if (typeof d["allowFree"] !== "boolean")
            bad(key, '"allowFree" must be a boolean');
          else
            decorations["allowFree"] = d["allowFree"];
        }
        if ("known" in d) {
          if (!Array.isArray(d["known"])) {
            bad(key, '"known" must be an array');
          } else {
            const known = [];
            for (const entry of d["known"]) {
              const e = entry;
              if (e === null || typeof e !== "object" || typeof e["id"] !== "string") {
                bad(key, 'each known decoration must be an object with a string "id"');
                continue;
              }
              const forces = "forces" in e ? e["forces"] : null;
              if (!FORCES.includes(forces)) {
                bad(key, `"forces" of decoration "${e["id"]}" must be "blocking", "non-blocking" or null`);
                continue;
              }
              known.push({ id: e["id"], forces: forces ?? null });
            }
            decorations["known"] = known;
          }
        }
        for (const k of Object.keys(d)) {
          if (k !== "allowFree" && k !== "known")
            notices.push(warning(`unknown key "decorations.${k}" ignored`, `decorations.${k}`));
        }
        out[key] = decorations;
        break;
      }
      case "severities": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const sev = {};
        for (const [code, s] of Object.entries(value)) {
          if (typeof s !== "string" || !SEVERITIES.includes(s)) {
            bad(key, `severity of "${code}" must be one of ${SEVERITIES.join(", ")}`);
            continue;
          }
          sev[code] = s;
        }
        out[key] = sev;
        break;
      }
      case "scope": {
        const r = readBooleanObject(key, value, ["validateReplies", "validateReviewSummary"], bad, notices);
        if (r)
          out[key] = r;
        break;
      }
      case "rules": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const rules = {};
        for (const [k, v] of Object.entries(value)) {
          if (!["minSubjectLength", "maxSubjectLength", "minDecisionSubjectLength"].includes(k)) {
            notices.push(warning(`unknown key "rules.${k}" ignored`, `rules.${k}`));
            continue;
          }
          if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
            bad(key, `"${k}" must be a non-negative integer`);
            continue;
          }
          rules[k] = v;
        }
        out[key] = rules;
        break;
      }
      case "exemptUsers": {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string"))
          bad(key, "must be an array of strings");
        else
          out[key] = value;
        break;
      }
      case "allowlistPatterns": {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
          bad(key, "must be an array of strings");
          break;
        }
        out[key] = filterAllowlistPatterns(value, notices);
        break;
      }
      case "toolCommands": {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
          bad(key, "must be an array of strings");
          break;
        }
        out[key] = filterToolCommands(value, notices);
        break;
      }
      case "resolverOverrideGroup": {
        if (typeof value === "string")
          out[key] = [value];
        else if (Array.isArray(value) && value.every((v) => typeof v === "string"))
          out[key] = value;
        else
          bad(key, "must be a string or an array of strings");
        break;
      }
      case "overrideLabel":
      case "badgeStyle":
      case "docUrl": {
        if (typeof value !== "string" || value === "")
          bad(key, "must be a non-empty string");
        else
          out[key] = value;
        break;
      }
      case "activation": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const a = value;
        const activation = {};
        if ("activatedAt" in a) {
          const v = a["activatedAt"];
          if (v === null)
            activation["activatedAt"] = null;
          else if (typeof v === "string" && !Number.isNaN(Date.parse(v)))
            activation["activatedAt"] = v;
          else
            bad(key, '"activatedAt" must be an ISO 8601 date or null');
        }
        for (const k of Object.keys(a)) {
          if (k !== "activatedAt")
            notices.push(warning(`unknown key "activation.${k}" ignored`, `activation.${k}`));
        }
        out[key] = activation;
        break;
      }
      case "configUrl": {
        if (value !== null && typeof value !== "string") {
          bad(key, "must be a string or null");
          break;
        }
        if (opts.level === "repo" && value !== null) {
          notices.push(warning("configUrl set in the repository file is ignored: the organization configuration URL comes exclusively from the floor channel (\xA78.1.2)", "configUrl"));
        } else {
          out[key] = value;
        }
        break;
      }
      case "coreMinVersion": {
        if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
          bad(key, "must be a semver string");
          break;
        }
        const major = Number(value.split(".")[0]);
        if (major > CORE_MAJOR) {
          unsupported = true;
          notices.push({
            kind: "unsupported-version",
            message: `coreMinVersion ${value} requires core/ major ${major}, this component runs ${CORE_MAJOR}: falling back to assist mode (or the floor if stricter)`,
            ref: key
          });
        } else {
          out[key] = value;
        }
        break;
      }
      case "configCacheTtlSeconds": {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
          bad(key, "must be a non-negative integer");
        else
          out[key] = value;
        break;
      }
      case "shortcuts": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const s = value;
        const shortcuts = {};
        if ("abbreviations" in s) {
          const a = s["abbreviations"];
          if (a === null || typeof a !== "object" || Array.isArray(a) || !Object.values(a).every((v) => typeof v === "string")) {
            bad(key, '"abbreviations" must be an object mapping abbreviation to inserted text');
          } else
            shortcuts["abbreviations"] = a;
        }
        for (const k of Object.keys(s)) {
          if (k !== "abbreviations")
            notices.push(warning(`unknown key "shortcuts.${k}" ignored`, `shortcuts.${k}`));
        }
        out[key] = shortcuts;
        break;
      }
      case "language": {
        if (value !== null && typeof value !== "string")
          bad(key, "must be a string or null");
        else
          out[key] = value;
        break;
      }
      case "telemetry": {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          bad(key, "must be an object");
          break;
        }
        const tel = value;
        const telemetry = {};
        if ("enabled" in tel) {
          if (typeof tel["enabled"] !== "boolean")
            bad(key, '"enabled" must be a boolean');
          else
            telemetry["enabled"] = tel["enabled"];
        }
        if ("endpoint" in tel) {
          if (tel["endpoint"] !== null && typeof tel["endpoint"] !== "string")
            bad(key, '"endpoint" must be a string or null');
          else
            telemetry["endpoint"] = tel["endpoint"];
        }
        for (const k of Object.keys(tel)) {
          if (k !== "enabled" && k !== "endpoint")
            notices.push(warning(`unknown key "telemetry.${k}" ignored`, `telemetry.${k}`));
        }
        out[key] = telemetry;
        break;
      }
    }
  }
  if (isInvalid)
    return { values: null, notices, invalid: true, unsupported };
  return { values: out, notices, invalid: false, unsupported };
}
function readBooleanObject(key, value, fields, bad, notices) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    bad(key, "must be an object");
    return null;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!fields.includes(k)) {
      notices.push(warning(`unknown key "${key}.${k}" ignored`, `${key}.${k}`));
      continue;
    }
    if (typeof v !== "boolean") {
      bad(key, `"${k}" must be a boolean`);
      continue;
    }
    out[k] = v;
  }
  return out;
}
var TOOL_COMMAND_MENTION = /^@[A-Za-z0-9_-]+$/;
function filterToolCommands(entries, notices) {
  const out = [];
  for (const e of entries) {
    if (e === "/*" || TOOL_COMMAND_MENTION.test(e))
      out.push(e);
    else
      notices.push(warning('toolCommands entry ignored: must be "/*" or an exact "@handle"', e));
  }
  return out;
}
var ALLOWLIST_MAX_PATTERNS = 50;
var ALLOWLIST_MAX_LENGTH = 256;
function filterAllowlistPatterns(patterns, notices) {
  const out = [];
  for (const p of patterns) {
    if (out.length >= ALLOWLIST_MAX_PATTERNS) {
      notices.push(warning(`allowlist pattern ignored: more than ${ALLOWLIST_MAX_PATTERNS} patterns`, p));
      continue;
    }
    if (p.length > ALLOWLIST_MAX_LENGTH) {
      notices.push(warning(`allowlist pattern ignored: longer than ${ALLOWLIST_MAX_LENGTH} characters`, p.slice(0, 40)));
      continue;
    }
    if (hasNestedQuantifier(p)) {
      notices.push(warning("allowlist pattern ignored: nested quantifiers are not allowed", p));
      continue;
    }
    try {
      new RegExp(p);
    } catch {
      notices.push(warning("allowlist pattern ignored: invalid regular expression", p));
      continue;
    }
    out.push(p);
  }
  return out;
}
function hasNestedQuantifier(pattern) {
  const stack = [];
  let containsQuantifier = false;
  let i = 0;
  const isQuantifierAt = (idx) => {
    const c = pattern[idx];
    if (c === "*" || c === "+" || c === "?")
      return true;
    if (c === "{") {
      const m = /^\{\d+(,\d*)?\}/.exec(pattern.slice(idx));
      return m !== null;
    }
    return false;
  };
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") {
      i++;
      while (i < pattern.length && pattern[i] !== "]") {
        if (pattern[i] === "\\")
          i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "(") {
      stack.push(containsQuantifier);
      containsQuantifier = false;
      i++;
      if (pattern[i] === "?") {
        i++;
        if (pattern[i] === ":" || pattern[i] === "=" || pattern[i] === "!") {
          i++;
        } else if (pattern[i] === "<") {
          i++;
          if (pattern[i] === "=" || pattern[i] === "!") {
            i++;
          } else {
            while (i < pattern.length && pattern[i] !== ">")
              i++;
            i++;
          }
        }
      }
      continue;
    }
    if (c === ")") {
      const inner = containsQuantifier;
      containsQuantifier = stack.pop() ?? false;
      if (inner && isQuantifierAt(i + 1))
        return true;
      containsQuantifier = containsQuantifier || inner;
      i++;
      continue;
    }
    if (isQuantifierAt(i)) {
      containsQuantifier = true;
      if (c === "{") {
        const m = /^\{\d+(,\d*)?\}/.exec(pattern.slice(i));
        i += m ? m[0].length : 1;
        continue;
      }
    }
    i++;
  }
  return false;
}

// packages/core/dist/config/merge.js
function mergeLevel(base, values) {
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(values)) {
    switch (key) {
      case "labels": {
        for (const entry of value) {
          const existing = out.labels.find((l) => l.id === entry.id);
          if (existing) {
            if (entry.enabled !== void 0)
              existing.enabled = entry.enabled;
            if (entry.blockingByDefault !== void 0)
              existing.blockingByDefault = entry.blockingByDefault;
            if (entry.alwaysNonBlocking !== void 0)
              existing.alwaysNonBlocking = entry.alwaysNonBlocking;
            if (entry.kind !== void 0)
              existing.kind = entry.kind;
            if (entry.icon !== void 0)
              existing.icon = entry.icon;
            if (entry.color !== void 0)
              existing.color = entry.color;
            if (entry.aliases !== void 0)
              existing.aliases = [...entry.aliases];
          } else {
            out.labels.push({
              id: entry.id,
              enabled: entry.enabled ?? true,
              blockingByDefault: entry.blockingByDefault ?? false,
              alwaysNonBlocking: entry.alwaysNonBlocking ?? false,
              // Un label que le produit ne livre pas ouvre un point, sauf s'il dit le contraire.
              kind: entry.kind ?? "remark",
              ...entry.icon !== void 0 ? { icon: entry.icon } : {},
              ...entry.color !== void 0 ? { color: entry.color } : {},
              aliases: entry.aliases ? [...entry.aliases] : []
            });
          }
        }
        break;
      }
      case "decorations": {
        const d = value;
        if (d.allowFree !== void 0)
          out.decorations.allowFree = d.allowFree;
        if (d.known) {
          for (const entry of d.known) {
            const existing = out.decorations.known.find((k) => k.id === entry.id);
            if (existing)
              existing.forces = entry.forces;
            else
              out.decorations.known.push({ id: entry.id, forces: entry.forces });
          }
        }
        break;
      }
      case "severities": {
        Object.assign(out.severities, value);
        break;
      }
      case "shortcuts": {
        const s = value;
        if (s.abbreviations)
          Object.assign(out.shortcuts.abbreviations, s.abbreviations);
        break;
      }
      case "exemptUsers":
      case "allowlistPatterns":
      case "toolCommands": {
        const merged = [...out[key]];
        for (const v of value)
          if (!merged.includes(v))
            merged.push(v);
        out[key] = merged;
        break;
      }
      case "resolverOverrideGroup": {
        const merged = [...out.resolverOverrideGroup];
        for (const v of value)
          if (!merged.includes(v))
            merged.push(v);
        out.resolverOverrideGroup = merged;
        break;
      }
      case "scope":
      case "rules":
      case "telemetry":
      case "activation": {
        Object.assign(out[key], value);
        break;
      }
      default: {
        out[key] = value;
      }
    }
  }
  return out;
}

// packages/core/dist/config/floor.js
var MODE_SCALE = { off: 0, assist: 1, warn: 2, enforce: 3 };
var SEVERITY_SCALE = { off: 0, warn: 1, error: 2 };
function maxMode(a, b) {
  return MODE_SCALE[a] >= MODE_SCALE[b] ? a : b;
}
function defaultFloor() {
  return { minimumMode: "off" };
}
var FLOOR_LIST_KEYS = ["exemptUsers", "allowlistPatterns", "toolCommands"];
function floorWarning(message, ref) {
  return { kind: "config-warning", message, ref };
}
function asStringArray(value, ref, notices) {
  if (!Array.isArray(value)) {
    notices.push(floorWarning("floor key ignored: expected an array of strings", ref));
    return [];
  }
  const kept = value.filter((e) => typeof e === "string");
  if (kept.length !== value.length) {
    notices.push(floorWarning(`floor: ${value.length - kept.length} non-string entr${value.length - kept.length > 1 ? "ies" : "y"} ignored`, ref));
  }
  return kept;
}
function asClosed(value, ref, notices) {
  if (value === void 0)
    return false;
  if (typeof value === "boolean")
    return value;
  notices.push(floorWarning('floor rule "closed" is not a boolean: the list is kept closed', ref));
  return true;
}
var FLOOR_KEYS = /* @__PURE__ */ new Set([
  "floorVersion",
  "configUrl",
  "minimumMode",
  "formatSeverity",
  "severities",
  "labels",
  "rules",
  "activation",
  "exemptUsers",
  "allowlistPatterns",
  "toolCommands",
  "resolverOverrideGroup",
  "configCacheTtlSeconds"
]);
function asNonNegativeInt(value, ref, notices) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0)
    return value;
  notices.push(floorWarning("floor key ignored: must be a non-negative integer", ref));
  return void 0;
}
function asOneOf(value, allowed, ref, notices) {
  if (typeof value === "string" && allowed.includes(value))
    return value;
  notices.push(floorWarning(`floor key ignored: must be one of ${allowed.join(", ")}`, ref));
  return void 0;
}
function asObject(value, ref, notices) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  notices.push(floorWarning("floor key ignored: must be an object", ref));
  return void 0;
}
function vetFloor(floor) {
  if (!floor)
    return { floor: defaultFloor(), notices: [], unsupported: false };
  const versionNotices = [];
  const version = floor.floorVersion === void 0 ? void 0 : asNonNegativeInt(floor.floorVersion, "floorVersion", versionNotices);
  if (version !== void 0 && version > SUPPORTED_FLOOR_VERSION) {
    return {
      floor: defaultFloor(),
      notices: [
        {
          kind: "unsupported-version",
          message: `floor version ${version} exceeds supported version ${SUPPORTED_FLOOR_VERSION}: the floor is not applied and the component falls back to assist mode (\xA78.1.1)`,
          ref: "floorVersion"
        }
      ],
      unsupported: true
    };
  }
  const notices = [...versionNotices];
  const out = { ...floor };
  if (version === void 0)
    delete out.floorVersion;
  else
    out.floorVersion = version;
  for (const key of FLOOR_LIST_KEYS) {
    const rule = out[key];
    if (rule === void 0)
      continue;
    if (rule !== null && typeof rule === "object") {
      for (const k of Object.keys(rule)) {
        if (k !== "minimum" && k !== "closed") {
          notices.push(floorWarning(`unknown floor key "${key}.${k}" ignored`, `${key}.${k}`));
        }
      }
    }
    const raw = asStringArray(rule?.minimum, `${key}.minimum`, notices);
    const filtered = [];
    const kept = key === "allowlistPatterns" ? filterAllowlistPatterns(raw, filtered) : key === "toolCommands" ? filterToolCommands(raw, filtered) : raw;
    for (const n of filtered)
      notices.push({ ...n, message: `floor: ${n.message}` });
    out[key] = { minimum: kept, closed: asClosed(rule?.closed, `${key}.closed`, notices) };
  }
  if (out.resolverOverrideGroup !== void 0) {
    out.resolverOverrideGroup = asStringArray(out.resolverOverrideGroup, "resolverOverrideGroup", notices);
  }
  if (out.labels !== void 0) {
    const obj = asObject(out.labels, "labels", notices);
    if (obj === void 0)
      delete out.labels;
    else {
      for (const k of Object.keys(obj)) {
        if (k !== "minimum")
          notices.push(floorWarning(`unknown floor key "labels.${k}" ignored`, `labels.${k}`));
      }
      out.labels = { minimum: asStringArray(obj["minimum"], "labels.minimum", notices) };
    }
  }
  for (const key of Object.keys(out)) {
    if (!FLOOR_KEYS.has(key)) {
      notices.push(floorWarning(`unknown floor key "${key}" ignored`, key));
      delete out[key];
    }
  }
  const drop = (k) => {
    delete out[k];
  };
  if (out.configUrl !== void 0 && out.configUrl !== null && typeof out.configUrl !== "string") {
    notices.push(floorWarning("floor key ignored: must be a string or null", "configUrl"));
    drop("configUrl");
  }
  if (out.minimumMode !== void 0) {
    const v = asOneOf(out.minimumMode, MODES, "minimumMode", notices);
    if (v === void 0)
      drop("minimumMode");
    else
      out.minimumMode = v;
  }
  if (out.formatSeverity !== void 0) {
    const v = asOneOf(out.formatSeverity, ["warn", "error"], "formatSeverity", notices);
    if (v === void 0)
      drop("formatSeverity");
    else
      out.formatSeverity = v;
  }
  if (out.severities !== void 0) {
    const obj = asObject(out.severities, "severities", notices);
    if (obj === void 0)
      drop("severities");
    else {
      const kept = {};
      for (const [code, sev] of Object.entries(obj)) {
        if (typeof sev === "string" && SEVERITIES.includes(sev))
          kept[code] = sev;
        else
          notices.push(floorWarning(`floor severity of "${code}" ignored: must be one of ${SEVERITIES.join(", ")}`, `severities.${code}`));
      }
      out.severities = kept;
    }
  }
  if (out.rules !== void 0) {
    const obj = asObject(out.rules, "rules", notices);
    if (obj === void 0)
      drop("rules");
    else {
      const rules = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k !== "minDecisionSubjectLength") {
          notices.push(floorWarning(`unknown floor key "rules.${k}" ignored`, `rules.${k}`));
          continue;
        }
        const n = asNonNegativeInt(v, "rules.minDecisionSubjectLength", notices);
        if (n !== void 0)
          rules.minDecisionSubjectLength = n;
      }
      out.rules = rules;
    }
  }
  if (out.activation !== void 0) {
    const obj = asObject(out.activation, "activation", notices);
    if (obj === void 0)
      drop("activation");
    else {
      const activation = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k !== "activatedAt") {
          notices.push(floorWarning(`unknown floor key "activation.${k}" ignored`, `activation.${k}`));
          continue;
        }
        if (typeof v === "string" && !Number.isNaN(Date.parse(v)))
          activation.activatedAt = v;
        else
          notices.push(floorWarning("floor key ignored: must be an ISO 8601 date", "activation.activatedAt"));
      }
      out.activation = activation;
    }
  }
  if (out.configCacheTtlSeconds !== void 0 && asNonNegativeInt(out.configCacheTtlSeconds, "configCacheTtlSeconds", notices) === void 0) {
    drop("configCacheTtlSeconds");
  }
  return { floor: out, notices, unsupported: false };
}
function vettedConfigUrl(vetted) {
  return vetted.unsupported ? null : vetted.floor.configUrl ?? null;
}
function applyFloor(config, floor, written, opts = {}) {
  const out = structuredClone(config);
  const notices = [];
  const overridden = (key) => {
    if (written.has(key)) {
      notices.push({
        kind: "floor-override",
        message: `repository/organization key "${key}" ignored: it would relax the enterprise floor (\xA78.1.1)`,
        ref: key
      });
    }
  };
  if (floor.minimumMode !== void 0 && MODE_SCALE[out.mode] < MODE_SCALE[floor.minimumMode]) {
    out.mode = floor.minimumMode;
    overridden("mode");
  }
  if (floor.formatSeverity === "error" && out.formatSeverity === "warn") {
    out.formatSeverity = "error";
    overridden("formatSeverity");
  }
  if (floor.severities) {
    for (const [code, min] of Object.entries(floor.severities)) {
      const effective = out.severities[code] ?? (code.startsWith("E-") ? "error" : "warn");
      if (SEVERITY_SCALE[effective] < SEVERITY_SCALE[min]) {
        out.severities[code] = min;
        overridden(`severities.${code}`);
      }
    }
  }
  if (floor.labels?.minimum) {
    const shipped = defaultConfig().labels;
    for (const id of floor.labels.minimum) {
      const label2 = out.labels.find((l) => l.id === id);
      if (!label2)
        continue;
      if (!label2.enabled) {
        label2.enabled = true;
        overridden(`labels.${id}.enabled`);
      }
      const shippedNonBlocking = shipped.find((l) => l.id === id)?.alwaysNonBlocking ?? false;
      if (shippedNonBlocking)
        continue;
      if (label2.alwaysNonBlocking) {
        label2.alwaysNonBlocking = false;
        overridden(`labels.${id}.alwaysNonBlocking`);
      }
      if (!label2.blockingByDefault) {
        label2.blockingByDefault = true;
        overridden(`labels.${id}.blockingByDefault`);
      }
    }
  }
  const floorMin = floor.rules?.minDecisionSubjectLength;
  if (floorMin !== void 0 && out.rules.minDecisionSubjectLength < floorMin) {
    out.rules.minDecisionSubjectLength = floorMin;
    overridden("rules.minDecisionSubjectLength");
  }
  if (!opts.skipActivation && floor.activation?.activatedAt !== void 0) {
    const f = floor.activation.activatedAt;
    const current = out.activation.activatedAt;
    if (current === null || Date.parse(f) < Date.parse(current)) {
      out.activation.activatedAt = f;
    }
  }
  for (const key of FLOOR_LIST_KEYS) {
    const rule = floor[key];
    if (!rule)
      continue;
    if (rule.closed) {
      const dropped = out[key].filter((v) => !rule.minimum.includes(v));
      if (dropped.length > 0)
        overridden(key);
      out[key] = [...rule.minimum];
    } else {
      for (const v of rule.minimum)
        if (!out[key].includes(v))
          out[key].push(v);
    }
  }
  if (floor.resolverOverrideGroup) {
    for (const g of floor.resolverOverrideGroup) {
      if (!out.resolverOverrideGroup.includes(g))
        out.resolverOverrideGroup.push(g);
    }
  }
  if (floor.configCacheTtlSeconds !== void 0 && out.configCacheTtlSeconds !== floor.configCacheTtlSeconds) {
    if (written.has("configCacheTtlSeconds"))
      overridden("configCacheTtlSeconds");
    out.configCacheTtlSeconds = floor.configCacheTtlSeconds;
  }
  for (const [code, sev] of Object.entries(out.severities)) {
    if (code.startsWith("E-") && sev === "off") {
      out.severities[code] = "warn";
      notices.push({
        kind: "config-warning",
        message: `severity of "${code}" cannot go below "warn" (\xA78.2): value "off" raised to "warn"`,
        ref: `severities.${code}`
      });
    }
  }
  return { config: out, notices };
}

// packages/core/dist/config/resolve.js
function resolveConfig(floor, org, repo) {
  const notices = [];
  const vetted = vetFloor(floor);
  notices.push(...vetted.notices);
  const written = /* @__PURE__ */ new Set();
  let config = defaultConfig();
  let unsupportedDocument = false;
  if (org.status === "found") {
    const parsed = parseConfigDocument(org.text, { level: "org" });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true;
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
  }
  if (repo.status === "found") {
    const parsed = parseConfigDocument(repo.text, { level: "repo" });
    notices.push(...parsed.notices);
    if (parsed.unsupported) {
      unsupportedDocument = true;
    } else if (!parsed.invalid && parsed.values) {
      config = mergeLevel(config, parsed.values);
      recordWrites(parsed.values, written);
    }
  }
  const floorAt = vetted.unsupported ? void 0 : vetted.floor.activation?.activatedAt;
  const lowerAt = config.activation.activatedAt;
  let liveActivation;
  if (floorAt === void 0)
    liveActivation = lowerAt;
  else if (lowerAt === null)
    liveActivation = floorAt;
  else
    liveActivation = Date.parse(floorAt) < Date.parse(lowerAt) ? floorAt : lowerAt;
  config.activation = { activatedAt: liveActivation };
  if (!vetted.unsupported) {
    const floored = applyFloor(config, vetted.floor, written, { skipActivation: true });
    config = floored.config;
    notices.push(...floored.notices);
  }
  config.labels = withoutShadowing(config.labels, notices);
  if (vetted.unsupported) {
    config.mode = "assist";
  } else if (unsupportedDocument) {
    config.mode = maxMode("assist", vetted.floor.minimumMode ?? "off");
  }
  config.configUrl = vettedConfigUrl(vetted);
  for (const [code, sev] of Object.entries(config.severities)) {
    if (code.startsWith("E-") && sev === "off") {
      config.severities[code] = "warn";
      if (!notices.some((n) => n.kind === "config-warning" && n.ref === `severities.${code}`)) {
        notices.push({
          kind: "config-warning",
          message: `severity of "${code}" cannot go below "warn" (\xA78.2): value "off" raised to "warn"`,
          ref: `severities.${code}`
        });
      }
    }
  }
  return { config, notices };
}
function withoutShadowing(labels, notices) {
  const lower = (n) => n.toLowerCase();
  const warn = (ref, message) => notices.push({ kind: "config-warning", message: `${message} (\xA78.2)`, ref });
  const out = [];
  const seenIds = /* @__PURE__ */ new Map();
  for (const l of labels) {
    const prior = l.enabled ? seenIds.get(lower(l.id)) : void 0;
    if (prior !== void 0) {
      warn(`labels.${l.id}`, `label "${l.id}" ignored: its id differs from label "${prior}" only by case`);
      continue;
    }
    if (l.enabled)
      seenIds.set(lower(l.id), l.id);
    out.push({ ...l, aliases: [...l.aliases] });
  }
  const active = out.filter((l) => l.enabled);
  const ids = new Map(active.map((l) => [lower(l.id), l.id]));
  const carriers = /* @__PURE__ */ new Map();
  for (const l of active) {
    for (const a of new Set(l.aliases.map(lower)))
      carriers.set(a, [...carriers.get(a) ?? [], l]);
  }
  for (const [alias, owners] of carriers) {
    const asId = ids.get(alias);
    const losers = asId !== void 0 ? owners.filter((o) => lower(o.id) !== alias) : owners.length > 1 ? owners : [];
    for (const o of losers) {
      o.aliases = o.aliases.filter((a) => lower(a) !== alias);
      warn(`labels.${o.id}.aliases`, asId !== void 0 ? `alias "${alias}" removed from label "${o.id}": it is the id of label "${asId}"` : `alias "${alias}" removed from label "${o.id}": it is also an alias of ${owners.filter((x) => x !== o).map((x) => `"${x.id}"`).join(", ")}`);
    }
  }
  return out;
}
function recordWrites(values, written) {
  for (const [key, value] of Object.entries(values)) {
    written.add(key);
    if (key === "severities") {
      for (const code of Object.keys(value))
        written.add(`severities.${code}`);
    } else if (key === "labels") {
      for (const entry of value) {
        if (entry.enabled === false)
          written.add(`labels.${entry.id}.enabled`);
        if (entry.blockingByDefault === false)
          written.add(`labels.${entry.id}.blockingByDefault`);
        if (entry.alwaysNonBlocking === true)
          written.add(`labels.${entry.id}.alwaysNonBlocking`);
      }
    } else if (key === "rules") {
      for (const k of Object.keys(value))
        written.add(`rules.${k}`);
    }
  }
}

// packages/core/dist/config/fingerprint.js
function fingerprintDomain(config) {
  return {
    mode: config.mode,
    formatSeverity: config.formatSeverity,
    // Une surcharge égale à la sévérité du tableau §3.5.2 ne change aucun verdict : elle
    // est écartée, pour que deux configurations sémantiquement identiques produisent la
    // même empreinte (§8.1.3, règle 2 — jamais de désaccord fabriqué).
    severities: Object.entries(config.severities).filter(([code, sev]) => sev !== (code.startsWith("E-") ? "error" : "warn")).sort(([a], [b]) => a < b ? -1 : 1),
    // TOUTES les entrées, sans filtre sur `enabled` ni omission (§9.2.2). Les labels de
    // réponse sont livrés ACTIVÉS : avec les défauts, `done:` est un label pour ce `core/` et
    // un mot inconnu pour un `core/` antérieur. Les verdicts diffèrent, l'empreinte DOIT donc
    // différer — une omission qui la garderait à `becd76df` ferait se croire d'accord deux
    // composants qui appliquent deux vocabulaires. `kind` n'y entre pas : il ne change aucun
    // verdict.
    labels: [...config.labels].sort((a, b) => a.id < b.id ? -1 : 1).map((l) => ({
      id: l.id,
      enabled: l.enabled,
      blockingByDefault: l.blockingByDefault,
      alwaysNonBlocking: l.alwaysNonBlocking,
      aliases: [...l.aliases].sort()
    })),
    decorations: {
      allowFree: config.decorations.allowFree,
      known: [...config.decorations.known].sort((a, b) => a.id < b.id ? -1 : 1).map((d) => ({ id: d.id, forces: d.forces }))
    },
    rules: {
      minSubjectLength: config.rules.minSubjectLength,
      maxSubjectLength: config.rules.maxSubjectLength,
      minDecisionSubjectLength: config.rules.minDecisionSubjectLength
    },
    scope: {
      validateReplies: config.scope.validateReplies,
      validateReviewSummary: config.scope.validateReviewSummary
    },
    // ————— Les deux membres à comparaison insensible à la casse (§4.2) —————
    // `exemptUsers` compare `UserInfo.login` sans égard à la casse, `toolCommands` compare
    // les mentions de la même façon : leur projection doit l'être aussi, sans quoi `@Codex`
    // et `@codex` — qui exemptent exactement les mêmes commentaires — produiraient deux
    // empreintes.
    //
    // DÉDOUBLONNÉS après normalisation, et pas seulement normalisés : le dédoublonnage ne
    // découle pas de la normalisation. L'union du §8.1.4 et le mélange du §8.1.3 comparent
    // au caractère près, si bien qu'une correction de casse sur une PR déjà épinglée laisse
    // les DEUX orthographes dans la configuration mélangée. Sans ces `Set`, le serveur
    // projetterait deux entrées là où l'extension n'en projette qu'une, et la règle 2 du
    // §8.1.3 désarmerait le blocage d'envoi sur un désaccord fabriqué.
    exemptUsers: [...new Set(config.exemptUsers.map((u) => u.toLowerCase()))].sort(),
    //
    // CE DÉDOUBLONNAGE OUVRE UNE FENÊTRE DE DÉCALAGE, et il faut la connaître : une
    // organisation déclarant `Dependabot[bot]` et un dépôt déclarant `dependabot[bot]`
    // donnent, chez les DEUX composants, une liste résolue à deux entrées — `mergeLevel()`
    // unit au caractère près. L'ancienne projection en produisait deux (`42f3097d`), la
    // nouvelle une (`3c5793aa`) : tant qu'un seul des deux composants est à jour, ils
    // divergent alors qu'ils exemptent la même chose.
    //
    // La fenêtre est inévitable pour toute correction de cette classe — dédoublonner dans
    // `mergeLevel()` plutôt qu'ici produirait exactement le même écart —, et elle est
    // transitoire : la règle 5 du §8.1.3 déclare le décalage NORMAL, et le désarmement du
    // blocage d'envoi qu'il provoque va dans le sens sûr. Sans le dédoublonnage, le
    // désaccord serait au contraire PERMANENT et sur une même version, ce que le principe
    // de ce fichier interdit — « jamais de désaccord fabriqué ». Le §9.2.2 tranche dans ce
    // sens, et c'est lui qui fait foi.
    // OMIS QUAND LA LISTE EST VIDE, et ce n'est pas une micro-optimisation : c'est ce qui
    // rend l'ajout de la clé compatible avec la version précédente de `core/`.
    //
    // L'entrée de `fingerprint()` est un objet sérialisé en JSON : un membre présent avec
    // `[]` ne produit PAS le même texte qu'un membre absent. Sans cette omission, un dépôt
    // qui ne configure RIEN verrait son empreinte changer du seul fait de la mise à jour —
    // mesuré : `f3c2a515` contre `becd76df`. Pendant toute la fenêtre de décalage entre
    // l'extension et le serveur, que la règle 5 du §8.1.3 déclare NORMALE, la règle 2
    // prendrait ce simple écart de version pour un désaccord de configuration et
    // désarmerait le blocage d'envoi sur **tous** les dépôts — y compris ceux qui n'ont
    // jamais entendu parler de cette clé.
    //
    // Une liste vide et une clé absente exemptent exactement la même chose : rien. Les
    // confondre dans la projection est donc juste, et pas seulement commode. Même
    // précaution que sur `severities`, dont une surcharge égale au défaut du §3.5.2 n'est
    // pas matérialisée, et pour exactement la même raison.
    ...config.toolCommands.length > 0 ? { toolCommands: [...new Set(config.toolCommands.map((c) => c.toLowerCase()))].sort() } : {},
    // `allowlistPatterns` n'est PAS dans ce cas : la comparaison y est sensible à la casse
    // — un motif est une expression régulière, pas un identifiant —, et l'union du §8.1.4
    // écarte déjà les doublons exacts. Rien à dédoublonner qui puisse naître.
    allowlistPatterns: [...config.allowlistPatterns].sort(),
    activatedAt: config.activation.activatedAt
  };
}
function fingerprint(config) {
  const json = JSON.stringify(fingerprintDomain(config));
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// packages/core/dist/evaluate.js
function evaluate(input2) {
  const { pr, platform, threads, loose, config, configNotices, forceState, ctx } = input2;
  const lang = config.language;
  const notices = [...configNotices];
  const base = {
    pr,
    mode: config.mode,
    isDraft: ctx.isDraft,
    activatedAt: ctx.activatedAt,
    configFingerprint: fingerprint(config),
    coreVersion: CORE_VERSION,
    docUrl: config.docUrl,
    language: lang
    // Pas de `targetUrl` : le §6.3.1 n'en fait plus le porteur de quoi que ce soit, et
    // aucun porteur configurable ne la fournit (§9.2.1). Le vérificateur y met, s'il le
    // veut, le lien de l'exécution qui publie — ce que `core/` ne peut pas connaître.
  };
  const inScope = ctx.activatedAt !== null && Date.parse(pr.createdAt) > Date.parse(ctx.activatedAt);
  if (!forceState && !inScope) {
    const headline = ctx.activatedAt === null ? t(lang, "headline.out-of-scope.no-activation-date") : t(lang, "headline.out-of-scope.before-activation", { activatedAt: ctx.activatedAt });
    return {
      ...base,
      state: "success",
      // CA-15 : jamais un échec — et jamais le silence là où le mode publie
      headline,
      formatDiagnostics: [],
      unresolvedBlockingThreads: [],
      notices,
      counts: { unresolvedThreads: 0, nonCompliantComments: 0, warnings: 0 },
      actions: {}
    };
  }
  const formatDiagnostics = [];
  const nonCompliantIds = /* @__PURE__ */ new Set();
  let warnings = 0;
  const check = (comment, zone, canCarryBlockingState) => {
    const vi = {
      body: comment.body,
      platform,
      isSystemGenerated: comment.isSystemGenerated,
      zone,
      canCarryBlockingState,
      author: comment.author,
      comment
    };
    for (const d of validate(vi, config)) {
      formatDiagnostics.push({ ...d, comment });
      if (d.severity === "error")
        nonCompliantIds.add(comment.id);
      else
        warnings++;
    }
  };
  for (const thread of threads) {
    check(thread.root, "thread-root", thread.canCarryBlockingState);
    for (const reply of thread.replies)
      check(reply, "reply", false);
  }
  for (const { comment, zone } of loose)
    check(comment, zone, comment.canCarryBlockingState);
  const unresolvedBlockingThreads = [];
  for (const thread of threads) {
    if (!thread.canCarryBlockingState)
      continue;
    const rootInput = {
      body: thread.root.body,
      platform,
      isSystemGenerated: thread.root.isSystemGenerated,
      zone: "thread-root",
      canCarryBlockingState: true,
      author: thread.root.author,
      comment: thread.root
    };
    if (!analyze(rootInput, config).blocking)
      continue;
    let resolvedValidly = false;
    if (thread.resolution === "resolved") {
      if (thread.resolvedBy === void 0) {
        resolvedValidly = true;
        notices.push({
          kind: "resolution-unattributed",
          message: t(lang, "notice.resolution-unattributed", { ref: thread.root.permalink }),
          ref: thread.root.permalink,
          ...thread.resolvedAt ? { at: thread.resolvedAt } : {}
        });
      } else if (thread.resolvedBy.id === thread.root.author.id) {
        resolvedValidly = true;
      } else if (ctx.isOverrideMember(thread.resolvedBy) && hasValidDecision(thread, input2)) {
        resolvedValidly = true;
      } else {
        const cause = ctx.isOverrideMember(thread.resolvedBy) ? t(lang, "notice.resolution-refused.decision-missing") : t(lang, "notice.resolution-refused.not-author", { login: thread.resolvedBy.login });
        notices.push({
          kind: "resolution-refused",
          message: t(lang, "notice.resolution-refused", { ref: thread.root.permalink, cause }),
          actor: thread.resolvedBy,
          ref: thread.root.permalink,
          ...thread.resolvedAt ? { at: thread.resolvedAt } : {}
        });
      }
    }
    if (!resolvedValidly)
      unresolvedBlockingThreads.push(thread);
  }
  let appliedExemption;
  const actions = {};
  if (ctx.exemption) {
    if (!ctx.isOverrideMember(ctx.exemption.by)) {
      notices.push({
        kind: "exemption-refused",
        message: t(lang, "notice.exemption-refused", { login: ctx.exemption.by.login }),
        actor: ctx.exemption.by,
        at: ctx.exemption.at
      });
    } else {
      const postedAt = Date.parse(ctx.exemption.at);
      const newBlocking = unresolvedBlockingThreads.filter((thread) => Date.parse(thread.root.createdAt) > postedAt);
      if (newBlocking.length > 0) {
        actions.removeLabel = config.overrideLabel;
        notices.push({
          kind: "exemption-reset",
          message: t(lang, "notice.exemption-reset"),
          // Le lien permanent, et non l'identifiant du fil : le §6.3.1 demande qu'une cause
          // soit atteignable en un clic au plus (CA-25).
          ref: newBlocking[0].root.permalink
        });
      } else {
        appliedExemption = { by: ctx.exemption.by, at: ctx.exemption.at };
      }
    }
  }
  const counts = {
    unresolvedThreads: unresolvedBlockingThreads.length,
    nonCompliantComments: nonCompliantIds.size,
    warnings
  };
  let state;
  if (forceState) {
    state = forceState.state === "failure" && ctx.isDraft ? "neutral" : forceState.state;
    if (!notices.some((n) => n.kind === forceState.because)) {
      notices.push({ kind: forceState.because, message: t(lang, `notice.${forceState.because}`, { detail: "" }) });
    }
  } else {
    const crit2Failed = counts.unresolvedThreads > 0;
    const crit1Failed = config.formatSeverity === "error" && counts.nonCompliantComments > 0;
    state = config.mode === "enforce" && !ctx.isDraft && appliedExemption === void 0 && (crit2Failed || crit1Failed) ? "failure" : "success";
  }
  const headlineParts = [];
  if (forceState?.because === "invalid-config") {
    const detail = notices.find((n) => n.kind === "invalid-config")?.message ?? "";
    headlineParts.push(t(lang, "headline.invalid-config", { detail }));
  }
  if (forceState?.because === "read-failed") {
    const detail = notices.find((n) => n.kind === "read-failed")?.message ?? "";
    headlineParts.push(t(lang, "headline.read-failed", { detail }));
  }
  if (forceState?.because === "activation-undated") {
    headlineParts.push(t(lang, "headline.activation-undated"));
  }
  if (ctx.isDraft)
    headlineParts.push(t(lang, "headline.draft"));
  if (appliedExemption) {
    headlineParts.push(t(lang, "headline.exempted", { by: appliedExemption.by.login, at: appliedExemption.at }));
  }
  headlineParts.push(t(lang, "headline", {
    threads: counts.unresolvedThreads,
    comments: counts.nonCompliantComments,
    warnings: counts.warnings
  }));
  return {
    ...base,
    state,
    headline: headlineParts.join(" "),
    formatDiagnostics,
    unresolvedBlockingThreads,
    notices,
    counts,
    actions,
    ...appliedExemption ? { exemption: appliedExemption } : {}
  };
}
function hasValidDecision(thread, input2) {
  for (const reply of thread.replies) {
    const analysis = analyze({
      body: reply.body,
      platform: input2.platform,
      isSystemGenerated: reply.isSystemGenerated,
      zone: "reply",
      canCarryBlockingState: false,
      author: reply.author,
      comment: reply
    }, input2.config);
    if (analysis.outcome !== "analyzed")
      continue;
    if (analysis.resolved?.label.id !== "decision")
      continue;
    if (!isCompliant(analysis.diagnostics))
      continue;
    if (!input2.ctx.isOverrideMember(reply.author))
      continue;
    return true;
  }
  return false;
}

// packages/core/dist/summary.js
function encodeSummary(result) {
  const pairs = [
    ["state", result.state],
    ["draft", result.isDraft ? "1" : "0"],
    ["exempt", result.exemption ? "1" : "0"],
    ["mode", result.mode],
    ["activated", result.activatedAt ?? "-"],
    ["core", result.coreVersion],
    ["cfg", result.configFingerprint],
    ["t", String(result.counts.unresolvedThreads)],
    ["c", String(result.counts.nonCompliantComments)],
    ["w", String(result.counts.warnings)]
  ];
  return `${SUMMARY_PREFIX} ${pairs.map(([k, v]) => `${k}=${v}`).join(" ")}`;
}

// packages/action/src/render.ts
function renderHumanOutput(result) {
  const lang = result.language;
  const lines = [result.headline, ""];
  if (result.unresolvedBlockingThreads.length > 0) {
    lines.push(`## ${t(lang, "output.unresolved-blocking-threads")}`);
    for (const thread of result.unresolvedBlockingThreads) {
      lines.push(
        `- [${firstLine(thread.root.body, lang)}](${thread.root.permalink}) \u2014 @${thread.root.author.login}`
      );
    }
    lines.push("");
  }
  if (result.formatDiagnostics.length > 0) {
    lines.push(`## ${t(lang, "output.format-diagnostics")}`);
    for (const diagnostic of result.formatDiagnostics) {
      const fix = diagnostic.fix ? ` \u2014 ${t(lang, "output.fix")} : \`${diagnostic.fix.replacement}\`` : "";
      lines.push(
        `- [\`${diagnostic.code}\`](${diagnostic.comment.permalink}) (${diagnostic.severity}) ${diagnostic.message}${fix}`
      );
    }
    lines.push("");
  }
  if (result.notices.length > 0) {
    lines.push(`## ${t(lang, "output.notices")}`);
    for (const notice of result.notices) {
      const actor = notice.actor ? ` \u2014 @${notice.actor.login}` : "";
      const at = notice.at ? ` \u2014 ${notice.at}` : "";
      lines.push(`- \`${notice.kind}\` ${notice.message}${actor}${at}`);
    }
    lines.push("");
  }
  lines.push(`[${t(lang, "output.doc-link")}](${result.docUrl})`);
  return lines.join("\n");
}
function firstLine(body, lang) {
  return body.split(/\r?\n/).find((line) => line.trim() !== "")?.slice(0, 80) ?? t(lang, "output.empty-body");
}

// packages/action/src/github.ts
var CHECK_NAME = "conventional-comments";
function webHostFromApiBase(apiBase) {
  return new URL(apiBase).hostname.replace(/^api\./, "");
}
var GithubVerifierAdapter = class {
  #apiBase;
  #webHost;
  #token;
  #prNumber;
  #scope;
  #event;
  #checkName;
  #fetchImpl;
  constructor(opts) {
    const apiBase = opts.apiBase ?? "https://api.github.com";
    const [owner, name] = opts.repository.split("/");
    if (!owner || !name) throw new Error(`repository must be "owner/name", got "${opts.repository}"`);
    this.#apiBase = apiBase;
    this.#webHost = opts.webHost ?? webHostFromApiBase(apiBase);
    this.#token = opts.token;
    this.#prNumber = opts.prNumber;
    this.#scope = [owner, name];
    this.#event = opts.event;
    this.#checkName = opts.checkName ?? CHECK_NAME;
    this.#fetchImpl = opts.fetchImpl ?? fetch;
  }
  platformProfile() {
    return { id: "github", suggestionInfoString: "suggestion" };
  }
  /** La PR injectée par la répartition l'emporte sur celle de l'événement : sur un job de
   * matrice, l'événement est celui de l'exécution planifiée, qui n'en désigne aucune. */
  async currentPr() {
    if (this.#prNumber !== void 0) return this.#byNumber(this.#prNumber);
    const fromEvent = prNumberFromEvent(this.#event);
    if (fromEvent === null) {
      throw new Error(
        "no pull request to evaluate: the event designates none and no number was injected"
      );
    }
    return this.#byNumber(fromEvent);
  }
  /** Les PR ouvertes du dépôt sur une exécution planifiée ; celles de l'exécution d'origine
   * pour le workflow compagnon, qui les porte dans `workflow_run.pull_requests`.
   *
   * Ce que cette liste contient pour une PR de fork est À VÉRIFIER PAR UNE MESURE (§A.8) : le
   * repli par la branche de tête est écrit parce qu'il faut un comportement défini dans les
   * deux cas, pas parce que le cas vide serait établi. */
  async pullRequestsToDispatch() {
    const fromRun = workflowRunPullRequests(this.#event);
    if (fromRun !== null) {
      if (fromRun.numbers.length > 0) {
        return Promise.all(fromRun.numbers.map((n) => this.#byNumber(n)));
      }
      if (fromRun.headBranch !== null) {
        return this.#byHeadBranch(fromRun.headOwner, fromRun.headBranch);
      }
      return [];
    }
    return this.#openPrs();
  }
  async fetchThreads(pr) {
    const [owner, name] = pr.scope;
    const threads = [];
    let cursor = null;
    for (; ; ) {
      const data = await this.#graphql(THREADS_QUERY, {
        owner,
        name,
        number: Number(pr.number),
        cursor
      });
      const connection = data.repository.pullRequest.reviewThreads;
      for (const node of connection.nodes) {
        const comments = [...node.comments.nodes];
        let commentCursor = node.comments.pageInfo?.hasNextPage ? node.comments.pageInfo.endCursor : null;
        while (commentCursor) {
          const more = await this.#graphql(THREAD_COMMENTS_QUERY, {
            id: node.id,
            cursor: commentCursor
          });
          comments.push(...more.node.comments.nodes);
          commentCursor = more.node.comments.pageInfo.hasNextPage ? more.node.comments.pageInfo.endCursor : null;
        }
        if (comments.length === 0) continue;
        const [rootRaw, ...replyRaws] = comments;
        threads.push({
          id: node.id,
          pr,
          root: this.#toComment(rootRaw),
          replies: replyRaws.map((reply) => this.#toComment(reply)),
          // Conversation marquée Resolved (§A.6) ; l'état est toujours exposé en GraphQL.
          resolution: node.isResolved ? "resolved" : "unresolved",
          ...node.resolvedBy ? { resolvedBy: this.#toUser(node.resolvedBy.login) } : {},
          canCarryBlockingState: true
          // fil de diff : porte un état de résolution (§4.1)
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }
    return threads;
  }
  async fetchStandaloneComments(pr) {
    const [owner, name] = pr.scope;
    const out = [];
    const issueComments = await this.#restPaged(
      `/repos/${owner}/${name}/issues/${pr.number}/comments`
    );
    for (const comment of issueComments) {
      out.push({
        comment: {
          id: `ic-${comment.id}`,
          author: this.#toUser(comment.user.login, String(comment.user.id), comment.user.type === "Bot"),
          body: comment.body ?? "",
          createdAt: comment.created_at,
          ...comment.updated_at ? { updatedAt: comment.updated_at } : {},
          permalink: comment.html_url,
          isSystemGenerated: false,
          canCarryBlockingState: false
        },
        zone: "conversation"
      });
    }
    const reviews = await this.#restPaged(
      `/repos/${owner}/${name}/pulls/${pr.number}/reviews`
    );
    for (const review of reviews) {
      out.push({
        comment: {
          id: `rv-${review.id}`,
          author: this.#toUser(review.user.login, String(review.user.id), review.user.type === "Bot"),
          body: review.body ?? "",
          createdAt: review.submitted_at ?? "",
          permalink: review.html_url,
          isSystemGenerated: false,
          canCarryBlockingState: false
        },
        zone: "review-body"
      });
    }
    return out;
  }
  async fetchConfigFile(pr) {
    const [owner, name] = pr.scope;
    try {
      const res = await this.#raw(`/repos/${owner}/${name}/contents/.conventional-comments.json`, {
        accept: "application/vnd.github.raw+json"
      });
      if (res.status === 404) return { status: "absent" };
      if (!res.ok) return { status: "unreachable", reason: `HTTP ${res.status}` };
      return { status: "found", text: await res.text() };
    } catch (e) {
      return { status: "unreachable", reason: String(e) };
    }
  }
  async fetchOrgConfig(url) {
    if (url === null) return { status: "absent" };
    try {
      const res = await this.#fetchImpl(url);
      if (res.status === 404) return { status: "absent" };
      if (!res.ok) return { status: "unreachable", reason: `HTTP ${res.status}` };
      return { status: "found", text: await res.text() };
    } catch (e) {
      return { status: "unreachable", reason: String(e) };
    }
  }
  /** Provenance exposée (§A.7) : la timeline rend les événements `labeled` avec leur acteur
   * et leur horodatage. Toute la timeline est parcourue — la provenance d'une étiquette peut
   * être loin dans l'historique d'une PR active, et s'arrêter à la première page la perdrait. */
  async fetchLabels(pr) {
    const [owner, name] = pr.scope;
    const current = await this.#restPaged(
      `/repos/${owner}/${name}/issues/${pr.number}/labels`
    );
    const timeline = await this.#restPaged(
      `/repos/${owner}/${name}/issues/${pr.number}/timeline`
    );
    return current.map((label2) => {
      const events = timeline.filter((e) => e.event === "labeled" && e.label?.name === label2.name);
      const last = events[events.length - 1];
      return {
        name: label2.name,
        ...last?.actor ? { by: this.#toUser(last.actor.login, String(last.actor.id), last.actor.type === "Bot") } : {},
        ...last?.created_at ? { at: last.created_at } : {}
      };
    });
  }
  async fetchHeadSha(pr) {
    const data = await this.#rest(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/pulls/${pr.number}`
    );
    return data.head.sha;
  }
  async isDraft(pr) {
    const data = await this.#rest(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/pulls/${pr.number}`
    );
    return data.draft;
  }
  /** Check run `conventional-comments` : la ligne cc/1 dans `output.title` — le seul
   * emplacement rendu sur la page de la PR —, la sortie humaine dans le corps (§6.3.1, §A.8).
   *
   * `neutral` compte parmi les conclusions qui SATISFONT une vérification obligatoire : c'est
   * la raison pour laquelle le §6.4 refuse de publier `neutral` sur une lecture en échec. */
  async publishStatus(pr, result) {
    await this.#rest(`/repos/${pr.scope[0]}/${pr.scope[1]}/check-runs`, {
      method: "POST",
      body: {
        name: this.#checkName,
        head_sha: result.headSha,
        status: "completed",
        conclusion: result.state,
        ...result.targetUrl ? { details_url: result.targetUrl } : {},
        output: {
          title: encodeSummary(result),
          summary: renderHumanOutput(result)
        }
      }
    });
  }
  /** Idempotente : retirer une étiquette absente est sans effet, jamais une erreur (§9.2.4). */
  async removeLabel(pr, name) {
    const res = await this.#raw(
      `/repos/${pr.scope[0]}/${pr.scope[1]}/issues/${pr.number}/labels/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (!res.ok && res.status !== 404) throw new Error(`removeLabel failed: HTTP ${res.status}`);
  }
  /** Sur GitHub, `resolverOverrideGroup` est une LISTE DE COMPTES — des logins séparés par
   * des virgules (§A.7). L'appartenance se tranche donc ici, sans aucun appel d'API.
   *
   * Un slug d'équipe (`org/team-slug`) serait plus naturel et n'est pas utilisable : le
   * résoudre demande la permission d'organisation *Members*, et le `GITHUB_TOKEN` n'a aucune
   * portée d'organisation (§A.8). Appeler l'API des équipes échouerait donc en 403 sur tout
   * dépôt réel — ce qui ferait dépendre l'habilitation d'une erreur réseau. */
  async isInGroup(user, group) {
    const logins = group.split(",").map((login) => login.trim().toLowerCase()).filter((login) => login !== "");
    return logins.includes(user.login.toLowerCase());
  }
  async #byNumber(number) {
    const data = await this.#rest(
      `/repos/${this.#scope[0]}/${this.#scope[1]}/pulls/${number}`
    );
    return {
      platform: "github",
      createdAt: data.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number
    };
  }
  async #openPrs() {
    const prs = await this.#restPaged(
      `/repos/${this.#scope[0]}/${this.#scope[1]}/pulls?state=open`
    );
    return prs.map((pr) => ({
      platform: "github",
      createdAt: pr.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number: pr.number
    }));
  }
  /** Les PR ouvertes dont la tête est `branch` chez `owner`.
   *
   * Le filtre `head` de l'API veut `owner:branche`, **pas un nom de branche nu** : la
   * documentation de *List pull requests* le décrit comme « head user or head organization
   * and branch name in the format of user:ref-name », avec `octocat:test-branch` pour
   * exemple. Passer `feature` seul ne désigne donc rien, et c'est exactement le cas que ce
   * repli sert : une PR de fork, dont la tête appartient au fork et non au dépôt protégé.
   * L'événement porte le propriétaire dans `workflow_run.head_repository.owner.login`.
   *
   * Sans ce propriétaire, on énumère et on filtre côté client plutôt que d'envoyer un filtre
   * dont on sait qu'il ne matche pas : perdre la PR serait la laisser porter un statut vert
   * périmé, le sens dangereux du §A.8. */
  async #byHeadBranch(owner, branch) {
    const [scopeOwner, scopeName] = this.#scope;
    const toRef = (pr) => ({
      platform: "github",
      createdAt: pr.created_at,
      host: this.#webHost,
      scope: [...this.#scope],
      number: pr.number
    });
    if (owner !== null) {
      const filter = encodeURIComponent(`${owner}:${branch}`);
      const prs2 = await this.#restPaged(
        `/repos/${scopeOwner}/${scopeName}/pulls?state=open&head=${filter}`
      );
      return prs2.map(toRef);
    }
    const prs = await this.#restPaged(`/repos/${scopeOwner}/${scopeName}/pulls?state=open`);
    return prs.filter((pr) => pr.head.ref === branch).map(toRef);
  }
  #toComment(raw) {
    return {
      id: raw.id,
      author: this.#toUser(raw.author?.login ?? "ghost", void 0, raw.author?.__typename === "Bot"),
      body: raw.body,
      createdAt: raw.createdAt,
      ...raw.lastEditedAt ? { updatedAt: raw.lastEditedAt } : {},
      permalink: raw.url,
      isSystemGenerated: false,
      canCarryBlockingState: true
    };
  }
  #toUser(login, id, isBot = false) {
    return { id: id ?? `login:${login.toLowerCase()}`, login, isServiceAccount: isBot };
  }
  async #graphql(query, variables) {
    const res = await this.#raw("/graphql", { method: "POST", body: { query, variables } });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const body = await res.json();
    if (!body.data || body.errors && body.errors.length > 0) {
      throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
  }
  async #rest(path, opts = {}) {
    const res = await this.#raw(path, opts);
    if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
    return await res.json();
  }
  /** Pagination REST : suit `page` tant que la page est pleine. */
  async #restPaged(path) {
    const out = [];
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
      const batch = await this.#rest(`${path}${sep}per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) return out;
    }
  }
  async #raw(path, opts = {}) {
    return this.#fetchImpl(`${this.#apiBase}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        authorization: `Bearer ${this.#token}`,
        accept: opts.accept ?? "application/vnd.github+json",
        "user-agent": "conventional-comments-toolkit",
        ...opts.body !== void 0 ? { "content-type": "application/json" } : {}
      },
      ...opts.body !== void 0 ? { body: JSON.stringify(opts.body) } : {}
    });
  }
};
function prNumberFromEvent(event) {
  if (event === null || typeof event !== "object") return null;
  const payload = event;
  if (typeof payload.pull_request?.number === "number") return payload.pull_request.number;
  if (payload.issue?.pull_request !== void 0 && typeof payload.issue.number === "number") {
    return payload.issue.number;
  }
  return null;
}
function workflowRunPullRequests(event) {
  if (event === null || typeof event !== "object") return null;
  const run = event.workflow_run;
  if (run === void 0) return null;
  return {
    numbers: (run.pull_requests ?? []).map((pr) => pr.number),
    headBranch: run.head_branch ?? null,
    // `head_repository` est un dépôt complet dans l'objet d'exécution, propriétaire compris.
    // Ce que porte `pull_requests[].head.repo`, en revanche, est une forme minimale — `id`,
    // `url`, `name` — sans `owner` : ce n'est donc pas là qu'on le prend.
    headOwner: run.head_repository?.owner?.login ?? null
  };
}
var COMMENT_FIELDS = `
  id
  body
  createdAt
  lastEditedAt
  url
  author { login __typename }`;
var THREADS_QUERY = `
  query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            isResolved
            resolvedBy { login }
            comments(first: 100) {
              pageInfo { hasNextPage endCursor }
              nodes {${COMMENT_FIELDS}
              }
            }
          }
        }
      }
    }
  }`;
var THREAD_COMMENTS_QUERY = `
  query($id: ID!, $cursor: String) {
    node(id: $id) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {${COMMENT_FIELDS}
          }
        }
      }
    }
  }`;

// packages/action/src/run.ts
async function runOnce(opts) {
  const { adapter } = opts;
  const pr = await adapter.currentPr();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const floorRead = await readFloor(opts.floorUrl ?? null, fetchImpl);
  if (floorRead.unreachable !== null) {
    return publishReadFailure(adapter, pr, floorRead.unreachable, null);
  }
  const floor = floorRead.floor;
  const repoRead = await adapter.fetchConfigFile(pr);
  const orgRead = await adapter.fetchOrgConfig(vettedConfigUrl(vetFloor(floor)));
  const resolved = resolveConfig(floor, orgRead, repoRead);
  const config = resolved.config;
  const unreachable = firstUnreachable([
    ["repository configuration", repoRead],
    ["organisation configuration", orgRead]
  ]);
  if (unreachable !== null) return publishReadFailure(adapter, pr, unreachable, config);
  const forceState = armForceState(config, resolved.notices);
  if ((config.mode === "off" || config.mode === "assist") && forceState === void 0) {
    return { pr, published: false, result: null, config };
  }
  let threads, loose, labels, isDraft;
  try {
    [threads, loose, labels, isDraft] = await Promise.all([
      adapter.fetchThreads(pr),
      adapter.fetchStandaloneComments(pr),
      adapter.fetchLabels(pr),
      adapter.isDraft(pr)
    ]);
  } catch (e) {
    return publishReadFailure(adapter, pr, String(e), config);
  }
  const overrideMembers = /* @__PURE__ */ new Set();
  if (config.resolverOverrideGroup.length > 0) {
    for (const candidate of actorsToTest(threads, labels)) {
      const memberships = await Promise.all(
        config.resolverOverrideGroup.map((group) => adapter.isInGroup(candidate, group))
      );
      if (memberships.every(Boolean)) overrideMembers.add(candidate.id);
    }
  }
  const exemptionLabel = labels.find((label2) => label2.name === config.overrideLabel);
  const result = evaluate({
    pr,
    platform: adapter.platformProfile(),
    threads,
    loose,
    config,
    configNotices: resolved.notices,
    ...forceState ? { forceState } : {},
    ctx: {
      activatedAt: config.activation.activatedAt,
      isDraft,
      // L'exemption est LUE de l'étiquette et de sa provenance (§6.3.2) : sans `by` ni `at`,
      // l'étiquette seule n'en accorde aucune — elle ne dit ni qui l'a posée ni quand, donc
      // ni l'habilitation ni la remise à zéro ne sont vérifiables.
      ...exemptionLabel?.by && exemptionLabel.at ? { exemption: { by: exemptionLabel.by, at: exemptionLabel.at } } : {},
      isOverrideMember: (user) => overrideMembers.has(user.id)
    }
  });
  result.headSha = await adapter.fetchHeadSha(pr);
  await adapter.publishStatus(pr, result);
  if (result.actions.removeLabel) await adapter.removeLabel(pr, result.actions.removeLabel);
  return { pr, published: true, result, config };
}
function armForceState(config, notices) {
  if (notices.some((notice) => notice.kind === "invalid-config")) {
    return {
      state: config.mode === "enforce" ? "failure" : "neutral",
      because: "invalid-config"
    };
  }
  if (config.activation.activatedAt === null) {
    return { state: "neutral", because: "activation-undated" };
  }
  return void 0;
}
async function publishReadFailure(adapter, pr, detail, config) {
  const effective = config ?? defaultConfig();
  const result = evaluate({
    pr,
    platform: adapter.platformProfile(),
    threads: [],
    loose: [],
    config: effective,
    configNotices: [{ kind: "read-failed", message: t(effective.language, "notice.read-failed", { detail }) }],
    forceState: { state: "failure", because: "read-failed" },
    ctx: {
      activatedAt: effective.activation.activatedAt,
      isDraft: false,
      // non lu : la lecture est précisément ce qui a échoué
      isOverrideMember: () => false
    }
  });
  result.headSha = await adapter.fetchHeadSha(pr);
  await adapter.publishStatus(pr, result);
  return { pr, published: true, result, config };
}
function firstUnreachable(reads) {
  for (const [what, read] of reads) {
    if (read.status === "unreachable") return `${what} unreachable \u2014 ${read.reason ?? "no reason given"}`;
  }
  return null;
}
async function readFloor(url, fetchImpl) {
  if (url === null) return { floor: null, unreachable: null };
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { floor: null, unreachable: `floor document unreachable \u2014 HTTP ${res.status}` };
    return { floor: JSON.parse(await res.text()), unreachable: null };
  } catch (e) {
    return { floor: null, unreachable: `floor document unreachable \u2014 ${String(e)}` };
  }
}
function actorsToTest(threads, labels) {
  const seen = /* @__PURE__ */ new Map();
  for (const thread of threads) {
    if (thread.resolvedBy) seen.set(thread.resolvedBy.id, thread.resolvedBy);
    for (const reply of thread.replies) seen.set(reply.author.id, reply.author);
  }
  for (const label2 of labels) if (label2.by) seen.set(label2.by.id, label2.by);
  return [...seen.values()];
}

// packages/action/src/main.ts
function input(name) {
  const raw = process.env[`INPUT_${name.toUpperCase()}`];
  return raw === void 0 || raw.trim() === "" ? void 0 : raw.trim();
}
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set \u2014 this is meant to run on a GitHub runner`);
  return value;
}
function readEvent() {
  const path = process.env["GITHUB_EVENT_PATH"];
  if (!path) return void 0;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function setOutput(name, value) {
  const file = process.env["GITHUB_OUTPUT"];
  if (!file) {
    process.stdout.write(`${name}=${value}
`);
    return;
  }
  appendFileSync(file, `${name}=${value}
`);
}
function byNumber(a, b) {
  const [x, y] = [Number(a), Number(b)];
  if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function runIndex() {
  const raw = Number(process.env["GITHUB_RUN_NUMBER"]);
  if (Number.isFinite(raw)) return raw;
  return Math.floor(Date.now() / 18e5);
}
async function main() {
  const token = input("token") ?? requiredEnv("GITHUB_TOKEN");
  const repository = input("repository") ?? requiredEnv("GITHUB_REPOSITORY");
  const prNumber = input("pr-number");
  const adapter = new GithubVerifierAdapter({
    token,
    repository,
    ...process.env["GITHUB_API_URL"] ? { apiBase: process.env["GITHUB_API_URL"] } : {},
    ...prNumber ? { prNumber: Number(prNumber) } : {},
    ...input("check-name") ? { checkName: input("check-name") } : {},
    event: readEvent()
  });
  if ((input("mode") ?? "evaluate") === "dispatch") {
    const prs = await adapter.pullRequestsToDispatch();
    const numbers = prs.map((pr) => pr.number).sort(byNumber);
    const slice = dispatchSlice(numbers, runIndex());
    setOutput("prs", JSON.stringify(slice));
    setOutput("count", String(slice.length));
    setOutput("total", String(numbers.length));
    if (slice.length < numbers.length) {
      console.log(
        `${numbers.length} PR ouvertes, plus que les ${MATRIX_LIMIT} d'une matrice : ${slice.length} \xE9valu\xE9es cette ex\xE9cution (PR ${slice[0]} \xE0 ${slice[slice.length - 1]}), le reste aux ex\xE9cutions suivantes.`
      );
    }
    return;
  }
  const outcome = await runOnce({ adapter, floorUrl: input("floor-url") ?? null });
  setOutput("state", outcome.result?.state ?? "none");
  setOutput("published", String(outcome.published));
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
export {
  main
};
//# sourceMappingURL=main.js.map
