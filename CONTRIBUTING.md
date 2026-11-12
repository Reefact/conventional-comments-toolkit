# Contributing

Issues and pull requests are welcome. This page is the short version of the repository's
rules; the full text is [`CLAUDE.md`](CLAUDE.md) (in French), and the reasons behind each rule
are recorded in [`docs/idr/`](docs/idr/README-en.md).

## Reporting a problem

Open an [issue](https://github.com/reefact/conventional-comments-toolkit/issues). When the
extension does not show up or misbehaves on a page, attach the diagnostic archive: settings
page → *Status* → **Download the diagnostic (.zip)**.

**Read `report.json` before attaching it.** It holds no comment, code or field text, but page
addresses name repositories and pull requests, and an interface label can name an account.

Diagnostic reports are collected as issues and fixed in batches rather than one by one, so
that a fix for one page does not break another
([DEC0006](docs/idr/DEC0006-diagnostic-reports-as-issues-en.md)).

## Setting up

```
npm install
npm test
npm run build
npm run checks
```

Commands that test a real browser need Chromium, installed once per machine with
`npx playwright-core install chromium`. See [`docs/development-en.md`](docs/development-en.md)
for the layout, the commands and the continuous integration.

## Rules of a pull request

- **Language.** Commit messages, pull request titles, bodies and review comments are in
  English. Code comments are in French. Repository documents are in English, with a French
  twin (`-en.md` / `-fr.md`) when possible
  ([DEC0002](docs/idr/DEC0002-english-first-language-follows-the-reader-en.md)).
- **One platform, or the shared code, never both.** A pull request touches one platform
  adapter, or the code they share; a change that needs both is split into two pull requests,
  the shared change first
  ([DEC0005](docs/idr/DEC0005-one-platform-per-pull-request-en.md)). `npm run check:pr-scope`
  checks it, and CI runs it.
- **The specification is normative.** [`specifications-fr.md`](specifications-fr.md) is never
  edited to match the implementation. A pull request may amend it together with the code that
  implements the amendment: that is a design decision, and it says so
  ([DEC0004](docs/idr/DEC0004-spec-amendments-ship-with-their-code-en.md)).
- **Acceptance criteria are tested.** A test that covers a criterion of §11 quotes its
  identifier (`CA-NN`); the mapping lives in [`docs/ca-matrix-fr.md`](docs/ca-matrix-fr.md).
- **A claim about the browser is measured.** What a platform's page or the browser does is
  checked in a real Chromium, not stated from memory. A bug fix is verified by removing it:
  its test must fail without the fix.
- **No prettier.** The code is formatted by hand; never run `prettier --write`
  ([DEC0003](docs/idr/DEC0003-an-inert-prettier-configuration-en.md)).
- **Invisible characters are written as escapes** (`\uXXXX`) in sources and tests.
- **User-facing changes go to the changelog** and to the release notes, in English and French.

Run `npm test`, `npm run build` and `npm run checks` before pushing.

## Reviews

Reviews of this repository are written in Conventional Comments, with the labels the toolkit
ships. See [labels and decorations](docs/guide/labels-en.md).

## Documentation

User documentation lives in [`docs/guide/`](docs/README-en.md), one page per subject, each in
English and French. A change to what the extension does or shows updates the page that
describes it, in both languages. The images are regenerated with `npm run docs:screenshots`.
