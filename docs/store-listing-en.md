# Chrome Web Store listing — content (EN)

Draft of the text fields for the submission form. See also
[`store-listing-fr.md`](store-listing-fr.md) for the French version and
[`store-permissions-justification-fr.md`](store-permissions-justification-fr.md)
for the permission justification.

## Category

**Developer Tools** — closest Chrome Web Store category: the extension
assists writing code review comments, not general productivity or social
tools.

## Short description (132 characters max)

> Conventional Comments assistant for GitHub code review: labels, validation, nothing leaves your browser.

(104 characters — within the limit.)

## Detailed description

> **Conventional Comments Toolkit** helps teams write clear code review
> comments that follow the
> [Conventional Comments](https://conventionalcomments.org/) convention,
> right inside GitHub's native editor (github.com, GitHub Enterprise
> Cloud and Server) — and, optionally, Azure DevOps.
>
> **What the extension brings**
> - A toolbar to insert standard labels
>   (`issue`, `suggestion`, `question`, `nitpick`...) without retyping
>   them.
> - Input validation with immediate visual feedback when a comment
>   doesn't follow the convention.
> - A keyboard-driven quick-input mode for people who'd rather not touch
>   the mouse.
> - Works standalone, no backend required: the extension assists and
>   validates even without the optional team-governance server
>   component.
>
> **Privacy by design**
> No comment, code, or diff content ever leaves your browser. No
> telemetry by default. No authentication token stored. Minimal
> permissions: no `<all_urls>` access — domains beyond GitHub (Azure
> DevOps, enterprise configuration hosts) are only requested on demand,
> with your explicit confirmation.
> See the [full privacy policy](../PRIVACY.md).
>
> **For organizations**
> An optional server component (not required to use the extension) lets
> teams enforce the convention as a merge requirement for pull requests,
> with a governed and auditable exemption mechanism.
>
> Public source code under the Apache-2.0 license:
> https://github.com/reefact/conventional-comments-toolkit

## Release notes for the first submission

> Initial release. See the GitHub repository's commit history for
> development history.

## Screenshot shot list (not produced in this document)

These require a real GitHub session and can't be generated
automatically here. Scenarios to cover, in priority order for the store
listing:

1. The Conventional Comments toolbar shown above a GitHub review comment
   editor, on a real pull request.
2. A label inserted (e.g. `suggestion:`) with the validation visual
   feedback (compliant state, success styling).
3. A non-compliant comment with the error visual feedback.
4. The options page (`options.html`) showing language selection and
   enabling an optional Azure DevOps domain.
5. (Optional) A resolved discussion thread overview, if the
   before/after contrast helps convey the product's value.

Chrome Web Store recommended format: 1280×800 or 640×400, PNG or JPEG,
up to 5 screenshots.
