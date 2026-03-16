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

With Homebrew:

```bash
brew install node@22
brew unlink node
brew link --force node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v
```

Then:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Credentials are read from `.env.local`:

```env
ADMIN_LOGIN=waiter
ADMIN_PASSWORD=waiter
ADMIN_SECONDARY_LOGIN=admin
ADMIN_SECONDARY_PASSWORD=admin
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

## Tests

Run:

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```
