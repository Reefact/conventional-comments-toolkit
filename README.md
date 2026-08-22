# conventional-comments-toolkit

Browser extension + server companion enforcing [Conventional Comments](https://conventionalcomments.org/) in code reviews, for GitHub (github.com, Enterprise Cloud/EMU, Enterprise Server) and Azure DevOps (Services, Server).

- **Browser extension** — authoring assistance and real-time validation while writing review comments.
- **Server companion** — the actual source of truth: verifies every comment after the fact and publishes a required status check, so a PR can't be completed with an unresolved blocking comment even without the extension installed.

No comment, code, or diff content ever leaves the browser. See [`specifications-fr.md`](./specifications-fr.md) for the full specification (in French).
