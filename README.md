# Menu QR Ordering MVP

MVP для ресторана с QR-меню:

- у каждого столика своя ссылка/QR;
- гость открывает меню по маршруту `/menu/:restaurantSlug/:tableNumber`;
- заказ сразу попадает в админку;
- админка разделена на вкладку заказов и вкладку столиков;
- данные пока хранятся в памяти сервера.

## Запуск

Нужен `Node.js 22.x LTS`.

Проверка:

```bash
node -v
```

Если у вас `v25.x`, `Next.js` может падать белым экраном и `Internal Server Error`.

Если у вас сейчас `node -v` показывает `v25.x`, переключитесь на `node@22`.

Через Homebrew:

```bash
brew install node@22
brew unlink node
brew link --force node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node -v
```

Дальше:

```bash
npm install
npm run dev
```

Открыть:

- `http://localhost:3010/`
- `http://localhost:3010/menu/olive-bistro/1`
- `http://localhost:3010/admin/orders`
- `http://localhost:3010/admin/tables`

Проект специально запускается на `3010`, чтобы не цеплять старые процессы на `3000/3001`.

## Запуск в VS Code

В проекте есть:

- `.vscode/tasks.json`
- `.vscode/launch.json`

Сценарий:

1. Открыть проект в VS Code.
2. Запустить задачу `npm: install`.
3. Открыть `Run and Debug`.
4. Выбрать `Run App in VS Code`.

## Что реализовано

- создание заказа с клиентской страницы столика;
- статусы `Новый`, `Готовится`, `Подан`, `Отменён`;
- чекбоксы по позициям заказа;
- кнопка `Подан` для всего заказа;
- кнопка `Отменить`;
- вкладка столиков с деталями каждого заказа;
- закрытие столика только если все заказы поданы или отменены;
- новая `sessionId` после закрытия столика.
