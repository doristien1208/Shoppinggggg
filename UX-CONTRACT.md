# Shoppinggggg behavior
Sources: user's 2026-10-14 brief and follow-ups approve GitHub Pages + Cloudflare Worker + GitHub JSON/assets, shared friend access using a list password.
Traditional Chinese, one list, JPY unit price multiplied by quantity. Render-all deliberate for up to 500 personal items. Location/filter in URL. Native radio filters; pressed location buttons.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | site/index.html buyer-filter + site/app.js | DESIGN.md | native | browser popup and keyboard |
| Form | site/app.js item-form | user brief | create | browser workflow |
| Scrollbar | site/styles.css | DESIGN.md | global | narrow browser |
| Toast | site/app.js message | this contract | status/error | browser live region |
| CRUD | worker/index.js + site/core.js ApiStore | user brief | read/create/checkoff | tests/worker.test.js |

GitHub PAT is only a Cloudflare Secret. Frontend uses shared password to receive an HMAC-signed 12h session. Session stored per tab in sessionStorage; password never persisted. No user accounts, cookies or database. Logout removes local session; rotate LIST_PASSWORD to revoke all. Public deployed snapshot readable before unlocking. Password gates edits, not public repo/Page confidentiality.
Worker accepts only configured origin, verifies session server-side and limits login/read/write requests. Fixed repository, branch, JSON and image routes; client cannot choose arbitrary GitHub paths. Git trees publish JSON and image atomically in one fast-forward commit. Stale branch version or concurrent changes return conflict; no automatic retry. UUID draft ID and content checks make repeated creates idempotent. Refresh for latest other-device state.
Fields validate with inline errors, retain drafts and focus invalid input. Cancel retains draft. Success closes editor, selects item's place and all statuses. Native dialog traps/restores focus and handles Escape; saving prevents close. Failed checkoff restores old boolean. API failures retain data and offer refresh. Session expiry prompts re-unlock. Client decodes/resizes photo to max 1024px, server enforces 1 MB and supported file signatures. Authenticated image API provides object URL with static fallback.
No edit-details flow. All password holders have the same add/checkoff/delete powers. This is a small friends' list, not unrestricted public editing.

User follow-up: buyer is a required free-text field for new items, max 80 characters, trimmed before save. Legacy records without buyer are shown as 未指定. Buyer selector supports all / a specific name / unassigned and persists in URL. Progress, total amount and progress bar use all items for the selected buyer, regardless of location/status filters. Locations are derived from that buyer’s items. After creation, select the new buyer and place and show all purchase states.

Delete is an authenticated, version-checked removal from JSON. Each item has a 44px trash button beside its checkbox. Native dialog names the item and initially focuses Cancel; busy state blocks cancellation and duplicate submit. On success, update data/summary/filter options and move focus to the header refresh button. Failure retains dialog and item with an inline error. Retrying an already-deleted ID is a no-op. Image assets remain for shared references and Git-history recovery. Invalid buyer/place filters fall back to all after deletion. The refresh icon is always beside the category heading and has an accessible name and tooltip. Intro has only the four user-specified lines; no permanent footer or unlock instruction. Status is a brief fixed notification, errors remain inline.
