# Shoppinggggg behavior
Source: user brief in Codex, 2026-10-14; explicit follow-up selects GitHub API persistence.
Single-page Traditional Chinese shopping list. Unit JPY price multiplied by quantity. Render-all is deliberate for a personal small shopping list. Location and filter persist in URL. Native radio filters; pressed buttons navigate locations.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | site/app.js item-form | user brief | create | browser workflow |
| Scrollbar | site/styles.css | DESIGN.md | global | narrow browser |
| Toast | site/app.js message | this contract | status/error | browser live region |
| CRUD | site/core.js GitHubStore | user brief | read/create/checkoff | tests/core.test.js |

Token stays in memory; user re-enters per new tab. Read-only snapshot before connection. No accounts or database. Updating JSON includes its previous SHA; conflicts never auto-retry, and user refreshes explicitly. Disable overlapping mutations. If network response is uncertain, refresh before retrying. Uploaded image can remain as an unreferenced asset if a later JSON write fails. Reuse successful upload on retry in the same form.
Form validation preserves data and focuses the first invalid field. On success close editor, select its place and show all statuses. Cancel preserves draft; warn on page unload if draft or mutation pending. Native dialog provides Escape, focus trap and focus restoration; prevent cancellation while saving. Failed checkoff restores its old boolean. Images fetched using authenticated API object URLs for immediate availability, static assets fallback. Missing image uses placeholder.
No destructive deletion in this version. No editable unit price after creation. Cross-device sync occurs on connection and explicit refresh, not realtime. Repo content and deployed Pages can be publicly visible; do not store tokens in repo. Rights are GitHub Contents read/write scoped to the selected repository.
