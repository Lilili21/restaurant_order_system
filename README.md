# Menu QR Ordering MVP

MVP for a restaurant QR-menu ordering flow:

- each table has its own private link / QR code;
- the guest opens the menu at `/menu/:restaurantSlug/:tableToken`;
- the order appears in the admin panel immediately;
- the admin area is split into `Orders`, `Tables`, and `Menu`;
- data is currently stored in local JSON files.

## Run

Use `Node.js 22.x LTS`.

Check your version:

```bash
node -v
```

If you are on `v25.x`, `Next.js` may fail with a white screen or `Internal Server Error`.

If `node -v` shows `v25.x`, switch to `node@22`.

**macOS (Homebrew):**

```bash
brew install node@22
brew unlink node
brew link --force node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v
```

**macOS / Linux (nvm):**

```bash
nvm install 22
nvm use 22
node -v
```

**Windows (nvm-windows):**

```powershell
nvm install 22
nvm use 22
node -v
```

**Windows (fnm):**

```powershell
fnm install 22
fnm use 22
node -v
```

Then:

**macOS / Linux:**

```bash
cp .env.example .env.local
npm install
npm run dev
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Credentials are read from `.env.local`:

```env
ADMIN_LOGIN=admin1
ADMIN_PASSWORD=admin1
ADMIN_SECONDARY_LOGIN=admin
ADMIN_SECONDARY_PASSWORD=admin
```

Counter mode + captcha (optional):

```env
FEATURE_COUNTER_MODE_ENABLED=true
# Leave empty (or use *) to allow all restaurant slugs.
# Use comma-separated slugs to limit rollout, for example:
# COUNTER_MODE_ALLOWED_SLUGS=beerabar,olive-bistro
COUNTER_MODE_ALLOWED_SLUGS=
COUNTER_CAPTCHA_ENABLED=true
COUNTER_CAPTCHA_SECRET=...
NEXT_PUBLIC_COUNTER_CAPTCHA_ENABLED=true
NEXT_PUBLIC_COUNTER_CAPTCHA_SITE_KEY=...
```

Open:

- `http://localhost:3010/`
- `http://localhost:3010/menu/olive-bistro/tbl_UxflwK16Xm3V`
- `http://localhost:3010/admin/orders`
- `http://localhost:3010/admin/tables`

The project intentionally runs on `3010` to avoid old dev processes on `3000` / `3001`.

## Run In VS Code

The project includes:

- `.vscode/tasks.json`
- `.vscode/launch.json`

Flow:

1. Open the project in VS Code.
2. Run the `npm: install` task.
3. Open `Run and Debug`.
4. Choose `Run App in VS Code`.

## Implemented

- guest order creation from the table menu page
- order statuses: `New`, `Preparing`, `Served`, `Cancelled`
- item-level checkboxes inside orders
- `Served` action for the whole order
- protected `Cancel` action
- tables view with grouped session details
- table closing only when all orders are served or cancelled
- automatic next `sessionId` after table closing
- waiter call flow
- menu editor with multilingual menu content (`HE / EN / RU`)
- private table token links instead of public table numbers
- unit and integration tests with `Vitest`

## Supabase Orders Storage (row-based)

Orders are now stored in row format (`orders_store` + `order_items_store`) instead of one large JSON payload.

Run this SQL in Supabase SQL Editor:

```sql
-- file: supabase/orders-row-storage.sql
```

If these tables are not created yet, the app keeps backward compatibility and falls back to legacy `app_state` storage.

## Tests

Run:

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```
