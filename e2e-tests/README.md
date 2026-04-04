# E2E Autotests (Menu + Live Orders)

Separate Playwright project for UI regression checks.

## What is covered

- `tests/live-orders.ui.spec.ts`
  - Checks `Hall` is renamed to `Floor`.
  - Verifies top zone chips (`Floor`, `Kitchen`, `Bar`) are larger than lower filter chips.
- `tests/live-orders.autorefresh.spec.ts`
  - Verifies `Live Orders` list updates from polling without manual reload.
- `tests/live-orders.expanded.top10.spec.ts`
  - First 10 extended Live Orders checks (`LIVE-01..LIVE-10`): load/render, zone filters, polling behavior, duplicates, sorting, kitchen timer statuses, and served status actions.
- `tests/live-orders.expanded.11-25.spec.ts`
  - Next 15 extended Live Orders checks (`LIVE-11..LIVE-25`): waiter/bill requests, kitchen/floor filters, ready/edit/cancel flows, service requests, close table, export today, and move-table flow.
- `tests/live-orders.expanded.26-45.spec.ts`
  - Final 20 extended Live Orders checks (`LIVE-26..LIVE-45`): hall/bar rendering details, cooked/new highlights, table and chunk filters, checkbox update flows, closed-session sorting/limit, close-table errors, and move-table validations.
- `tests/menu.availability.spec.ts`
  - Verifies `available` toggle in Admin Menu updates item state.
  - Verifies item switched to unavailable in Admin disappears in Guest Menu.
- `tests/tables.closed-shift.spec.ts`
  - Verifies `Closed tables` shows only sessions from the current shift.
- `tests/menu.client.top10.spec.ts`
  - Top-10 client menu checks (open page, not-found cases, skeleton, filters, cart persistence, unavailable item visibility).
- `tests/menu.client.11-20.spec.ts`
  - Client menu checks 11-20 (no-image cards, layout stability, cart math, volume options, submit behavior).
- `tests/menu.client.21-30.spec.ts`
  - Client menu checks 21-30 (submit success, payload checks, duplicate protection, retry flow, kitchen/bar closed constraints).
- `tests/menu.client.31-40.spec.ts`
  - Client menu checks 31-40 (waiter/bill requests, error handling, current orders block, status updates, polling stability).
- `tests/menu.client.41-54.spec.ts`
  - Client menu checks 41-54 (polling regressions, refresh consistency, promotions/business lunch, recommendations, localization and fallback behavior).
- `tests/menu.client.smoke.spec.ts`
  - Fast pre-release smoke run (core menu open, language/filter switch, add-to-cart, submit flow, waiter call).
- `tests/menu-live.integration.spec.ts`
  - End-to-end integration between guest menu and admin Live Orders (`INT-01..INT-10`): order submit visibility in admin, served status sync back to guest, waiter/bill roundtrip, multi-order consistency, admin polling pickup, and service-request lock behavior.
- `tests/menu-live-tables.integration.advanced.spec.ts`
  - Advanced cross-module integration (`ADV-01..ADV-10`): close table + closed/export, move-table isolation, happy-hour totals across menu/live/tables/export, transient `500/429` retry recovery, cross-device sync/race scenarios, and shift-boundary filtering around `workingHoursFrom`.

## Quick start

```bash
cd e2e-tests
npm install
npm run install:browsers
npm test
```

## Run options

- Test production site (manual run):

```bash
cd e2e-tests
npm run test:prod
```

- Run only first 10 client-menu checks:

```bash
cd e2e-tests
npm run test:menu-top10
```

- Run first 10 extended Live Orders checks:

```bash
cd e2e-tests
npm run test:live-top10
```

- Run extended Live Orders checks 11-25:

```bash
cd e2e-tests
npm run test:live-11-25
```

- Run final 20 extended Live Orders checks 26-45:

```bash
cd e2e-tests
npm run test:live-26-45
```

- Run client-menu checks 11-20:

```bash
cd e2e-tests
npm run test:menu-11-20
```

- Run client-menu checks 21-30:

```bash
cd e2e-tests
npm run test:menu-21-30
```

- Run client-menu checks 31-40:

```bash
cd e2e-tests
npm run test:menu-31-40
```

- Run client-menu checks 41-54:

```bash
cd e2e-tests
npm run test:menu-41-54
```

- Run all client-menu suites (TC-1..54):

```bash
cd e2e-tests
npm run test:menu-all
```

- Run quick smoke profile:

```bash
cd e2e-tests
npm run test:menu-smoke
```

- Run menu + live-orders integration tests:

```bash
cd e2e-tests
npm run test:integration-menu-live
```

- Run advanced menu + live + tables integration tests:

```bash
cd e2e-tests
npm run test:integration-advanced
```

- Run only current-shift filter check in Closed tables:

```bash
cd e2e-tests
npm run test:tables-shift
```

- Test local app with auto-started dev server:

```bash
cd e2e-tests
npm run test:local
```

## Notes

- Tests intentionally mock API routes in browser (`page.route`) to stay stable and not depend on live DB content.
- Tests run only when you execute an npm command manually. They do not run on file save/hot reload by default.
- HTML report is generated in `playwright-report`.
- `menu.client.top10.spec.ts` uses `/menu/olive-bistro/0` by default.
- `menu.availability.spec.ts`:
  - Admin toggle check runs without extra env.
  - Guest visibility check needs `E2E_ORDERING_MENU_PATH`.
- For ordering-specific checks (`TC-04`, `TC-09`) pass a real table URL via:
  - `E2E_ORDERING_MENU_PATH=/menu/<restaurantSlug>/<tableToken>`
- `menu.client.11-20.spec.ts` also needs `E2E_ORDERING_MENU_PATH` for cart/order flows (`TC-13`...`TC-20`).
- `menu.client.21-30.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` for `TC-21`...`TC-24`
  - `E2E_KITCHEN_CLOSED_MENU_PATH` for `TC-25` and `TC-27`
  - `E2E_BAR_CLOSED_MENU_PATH` for `TC-26` and `TC-28`
  - either closed path for `TC-29`
  - `E2E_OPEN_CLOSE_TOGGLE_MENU_PATH` (path with open countdown timer) for `TC-30`
- `menu.client.31-40.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` for all cases
- `menu.client.41-54.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` for most ordering/polling/localization checks
  - `E2E_PROMO_ACTIVE_MENU_PATH` and `E2E_PROMO_INACTIVE_MENU_PATH` for `TC-43`
  - `E2E_BUSINESS_LUNCH_MENU_PATH` (and optional `E2E_BUSINESS_LUNCH_HIDDEN_ITEM`) for `TC-44`
- `menu.client.smoke.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` for `SM-03`...`SM-05` (otherwise only preview smoke checks run)
- `menu-live.integration.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` (real table URL)
- `menu-live-tables.integration.advanced.spec.ts` needs:
  - `E2E_ORDERING_MENU_PATH` for `ADV-01..ADV-08` (real table URL)
  - `ADV-09` and `ADV-10` can run without extra env

## Debug failed tests

```bash
npx playwright show-report
```

Use `playwright` spelling exactly (not `playwrite`).
