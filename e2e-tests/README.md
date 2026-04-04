# E2E Autotests (Menu + Live Orders)

Separate Playwright project for UI regression checks.

## What is covered

- `tests/live-orders.ui.spec.ts`
  - Checks `Hall` is renamed to `Floor`.
  - Verifies top zone chips (`Floor`, `Kitchen`, `Bar`) are larger than lower filter chips.
- `tests/live-orders.autorefresh.spec.ts`
  - Verifies `Live Orders` list updates from polling without manual reload.
- `tests/menu.availability.spec.ts`
  - Verifies `available` toggle in Admin Menu updates item state.

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

- Test local app with auto-started dev server:

```bash
cd e2e-tests
npm run test:local
```

## Notes

- Tests intentionally mock API routes in browser (`page.route`) to stay stable and not depend on live DB content.
- Tests run only when you execute an npm command manually. They do not run on file save/hot reload by default.
- HTML report is generated in `playwright-report`.
