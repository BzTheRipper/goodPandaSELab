# GoodPanda

Food delivery MVP: customers order from restaurants, and drones fly the food to a pickup hub, where the customer collects it with a one-time code and pays in cash.

- **client/**: React (Vite), React Router, Context, Axios, socket.io-client
- **server/**: Node, Express, Mongoose, Socket.IO, JWT (bcryptjs), zod, multer

## Running locally

Node 20+ is recommended. The project does not enforce an `engines` constraint; the installed Vite/Vitest tooling also permits Node 18.

Install dependencies once from the repository root:

```bash
cd server && npm install
cd ../client && npm install
```

### Option A: no MongoDB installed (fastest)

Run these in **separate terminals**, both starting from the repository root:

```bash
# Terminal 1 — in-memory MongoDB, auto-seeded, data lost on exit
cd server && npm run dev:memory

# Terminal 2 — client at http://localhost:5173
cd client && npm run dev
```

`npm run dev:memory` starts its own API on port 5000; it is not a companion to `npm run dev`.

### Option B: real MongoDB

In terminal 1, start the API:

```bash
cd server
cp .env.example .env                # Windows PowerShell: Copy-Item .env.example .env
# set MONGO_URI and a strong JWT_SECRET
npm run seed                        # wipes and reseeds the database
npm run dev                         # API on http://localhost:5000
```

In terminal 2, start the client:

```bash
cd client && npm run dev
```

Server scripts also include `npm start` for a non-watching start. Client scripts include `npm run build` and `npm run preview`.

### Environment variables

Server defaults from `server/src/config/env.js`:

| Variable | Default / behavior |
|---|---|
| `PORT` | `5000` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/goodpanda` |
| `JWT_SECRET` | `dev-only-secret` in development; required in production |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_ORIGIN` | `http://localhost:5173` |
| `UPLOAD_DIR` | `uploads` |
| `IMGBB_API_KEY` | empty (local-disk uploads) |
| `DRONE_TICK_MS` | `1000` |
| `DRONE_SPEED_MPS` | `60` |
| `DRONE_BATTERY_PER_KM` | `2` |
| `DRONE_MIN_BATTERY` | `20` |
| `DEFAULT_DELIVERY_FEE` | `60` |

Client defaults: `VITE_API_PROXY=http://localhost:5000` for the dev proxy, and an empty `VITE_API_URL` (same origin) for production builds. Tests override `NODE_ENV=test`, `JWT_SECRET=test-secret`, `DRONE_TICK_MS=20`, `DRONE_SPEED_MPS=100000` and `UPLOAD_DIR=uploads-test`.

### Image hosting (ImgBB)

Restaurant logos/covers, menu photos and profile pictures are uploaded to [ImgBB](https://imgbb.com) when `IMGBB_API_KEY` is set in `server/.env`, and the absolute ImgBB URL is stored. With the key left empty, uploads are stored on local disk in `UPLOAD_DIR` and served from `/uploads`. Set `IMGBB_API_KEY=` (empty) if you want to exercise local-disk uploads. A failed ImgBB upload returns `502 UPLOAD_FAILED`; it does not silently fall back to local storage. Both providers go through `server/src/services/storage.service.js`, so switching providers is a single seam. Keep the key in `.env` only; it is gitignored.

The Vite dev server proxies `/api`, `/uploads` and `/socket.io` to the API, so you don't need to configure CORS during development. To point the client at a different API, set `VITE_API_PROXY` (or `VITE_API_URL` for a built client) in `client/.env`.

### Tests

```bash
cd server
npm test        # Vitest: state machine, API/RBAC, lifecycle, chat, reviews, favourites, account, browse, insights
npm run smoke   # with the stack running: one happy-path order through the client proxy
```

`npm run smoke` targets `http://localhost:5173/api` by default; override it with `SMOKE_BASE`. It covers confirmation, chat, dispatch, arrival, collection and the admin dashboard, but not every lifecycle branch.

## UI structure

The React client lives in `client/src`:

- **`pages/`** — one folder per area (`public`, `customer`, `owner`, `admin`, `orders`). Every route is
  lazy-loaded in `App.jsx` and split into chunks; some related screens intentionally share a chunk.
- **`components/ui/`** — the shared design-system library (Button, Card, Table, Field/Input, Tabs,
  Chip, StatusPill, InfoTooltip, Modal/Drawer, ConfirmDialog, Toast, skeleton/empty/error feedback).
  Build screens from these rather than raw HTML.
- **`components/layout/`** — app shells, header/sidebar, navigation and notifications.
- **`components/order/` and `components/owner/`** — cards and panels shared by the role-aware
  `/orders/:id` detail page.
- **`context/`, `hooks/`, `api/`, `utils/`** — auth/cart/socket state, data hooks (`useAsync`,
  `useAction`, `useOrderList`), the axios client, and formatting/status helpers.
- **`styles/tokens.css`** — the single source of truth for the theme (brand/neutral/semantic colors,
  typography, spacing, radii, shadows, control heights, z-index). **`styles/base.css`** holds global
  resets, focus rings and reduced-motion rules. Component styles are CSS Modules.

**Changing the theme:** edit the custom properties in `client/src/styles/tokens.css`; almost every
color, font size, space and radius elsewhere references a token, so most theme changes are a single
edit there. Status labels, colors and helper hints are centralised in `client/src/utils/status.js`
(the only place order/drone/restaurant/payment statuses are mapped). The full design contract is in
`client/DESIGN.md`.

## Features

- **Customers:** browse with search, category chips, *Open now*, *Saved* and sort (recommended / top rated / A–Z); save favourite restaurants; single-restaurant cart; live order tracking with drone position and chat; rate a collected order (1–5 stars + comment); *Order again* refills the cart from a past order (skipping items no longer on the menu); profile photo and password change.
- **Owners:** menu and restaurant management, live order board, drone loading/dispatch, **Insights** (food revenue, average order, completion rate, 14-day sales chart, best sellers) and **Reviews** (rating breakdown, *Needs reply* filter, public replies).
- **Admins:** dashboard with order/fleet stats plus gross sales and delivery-fee revenue, restaurant approvals, users, hubs, drones, delivery fee and pickup verification.
- **Responsive:** every screen is designed for phones, tablets and desktop (canonical breakpoints 640 / 768 / 1024 / 1280 px, plus a few component-specific ones); owner/admin sidebars collapse into a drawer on small screens.

## Seeded accounts

| Role     | Email                     | Password    | Notes                         |
|----------|---------------------------|-------------|-------------------------------|
| Admin    | admin@goodpanda.test      | admin123    | Admins only come from the seed |
| Owner    | owner1@goodpanda.test     | owner123    | Panda Biryani House           |
| Owner    | owner2@goodpanda.test     | owner123    | Green Leaf Cafe               |
| Customer | customer@goodpanda.test   | customer123 |                               |

The seed also creates 3 hubs (Banani, Motijheel, Mirpur) and 4 drones. GP-DR-04 has 15% battery, below the default `DRONE_MIN_BATTERY` of 20%, so with default settings it cannot be loaded. That lets you exercise the "no suitable drone" path.

## Order lifecycle

```text
Happy path:
PLACED → ACCEPTED → PREPARING → READY_FOR_DRONE → IN_FLIGHT → ARRIVED_AT_HUB → COLLECTED

Owner:
PLACED → REJECTED
PLACED / ACCEPTED / PREPARING → NEEDS_CUSTOMER_CONFIRMATION
NEEDS_CUSTOMER_CONFIRMATION → CANCELLED
ACCEPTED / PREPARING → CANCELLED only after the customer continued

Customer:
PLACED → CANCELLED
NEEDS_CUSTOMER_CONFIRMATION → previous status or CANCELLED

Admin:
PLACED / ACCEPTED / PREPARING / READY_FOR_DRONE / IN_FLIGHT / ARRIVED_AT_HUB → CANCELLED
IN_FLIGHT → READY_FOR_DRONE (recovery after drone failure)
ARRIVED_AT_HUB → COLLECTED

System:
IN_FLIGHT → ARRIVED_AT_HUB
```

All transitions live in `server/src/services/orderStateMachine.js`.
- An invalid transition returns `409 INVALID_TRANSITION`.
- A transition the caller's role can't make returns `403 TRANSITION_FORBIDDEN`.
- Every change is appended to `statusHistory`.
- Concurrent edits are rejected through optimistic concurrency (`409 CONCURRENT_UPDATE`).
- Drones are claimed atomically, so two orders can never load the same drone.

## API (all under `/api`)

- `GET /health` — health check returning `{ ok: true, name: 'GoodPanda' }`.

Errors always look like `{ "error": { "message", "code", "details?" } }`.

**Auth**
- `POST /auth/register` (customer or owner)
- `POST /auth/login`
- `POST /auth/logout` (authenticated; the token is discarded client-side)
- `GET /auth/me`, `PATCH /auth/me`
- `POST /auth/me/password` (`currentPassword`, `newPassword`)
- `PUT /auth/me/avatar` (multipart `avatar`), `DELETE /auth/me/avatar`
- `GET /auth/me/favorites`, `PUT|DELETE /auth/me/favorites/:id` (customer)

**Public**
- `GET /restaurants?q=&category=&openNow=true&sort=recommended|rating|name`
- `GET /restaurants/:id`
- `GET /restaurants/:id/reviews`
- `GET /hubs`

**Owner**
- `GET /owner/restaurant`, `POST /owner/restaurant`, `PATCH /owner/restaurant` (multipart `logo`/`cover`)
- `PATCH /owner/restaurant/open`
- `GET /owner/insights`
- `GET /owner/reviews`, `POST /owner/reviews/:id/reply`
- `GET /owner/menu`, `POST /owner/menu`
- `PATCH /owner/menu/:id`, `DELETE /owner/menu/:id`
- `PATCH /owner/menu/:id/availability`
- `GET /drones/available`

**Orders**
- `POST /orders` (customer)
- `GET /orders` (scoped to the caller's role), `GET /orders/:id`
- `PATCH /orders/:id/status` (owner: accept/reject/prepare/ready plus limited cancellation after a
  confirmation flow; customer: cancel while allowed; admin: cancel and recover
  `IN_FLIGHT → READY_FOR_DRONE`)
- `POST /orders/:id/confirmation-request` (owner), `POST /orders/:id/confirmation-response` (customer)
- `GET /orders/:id/messages`, `POST /orders/:id/messages`
- `POST /orders/:id/load-drone`, `POST /orders/:id/unload-drone`, `POST /orders/:id/dispatch` (owner)
- `POST /orders/:id/collect` (admin verifies the pickup code; this marks the order PAID)
- `POST /orders/:id/review` (customer, once per COLLECTED order; updates the restaurant's rating)

**Notifications**
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

**Admin**
- `GET /admin/dashboard`
- `GET /admin/restaurants`, `PATCH /admin/restaurants/:id/status`
- `GET /admin/users`, `PATCH /admin/users/:id/active`
- `GET|POST /admin/hubs`, `PATCH|DELETE /admin/hubs/:id`
- `GET|POST /admin/drones`, `PATCH|DELETE /admin/drones/:id`, `POST /admin/drones/:id/fail`
- `GET /admin/settings`, `PUT /admin/settings` (delivery fee)

**Socket.IO** (pass the JWT as `auth.token`)
- Client emits: `order:join` and `order:leave` to subscribe to an order's live updates.
- Server emits: `notification`, `order:new`, `order:updated`, `chat:message`, `drone:location`, `drone:updated`.

## Assumptions and ambiguities

- **Drone location on load:** a drone is assumed to be at the restaurant when it is loaded, so its position is set to the restaurant's location.
- **Simulated flight:** flight is a straight-line simulation (`services/drone`). The `flightController` singleton backed by `SimulatedFlightController` is the seam for real routing or hardware. Speed, tick and battery drain are configured in `.env`. In-progress flights resume after a server restart.
- **Hub operator:** the admin acts as the hub operator. The admin verifies the customer's pickup code, which marks the order COLLECTED and settles the cash payment. Only the customer can see the code.
- **Payment:** cash on collection is the only method. It sits behind `payment.service.js` so a gateway can be added later.
- **Prices:** prices and the delivery fee are always computed on the server. The admin sets the delivery fee.
- **Owners:** each owner has exactly one restaurant. New restaurants need admin approval before they appear publicly.
- **Owner cancellation:** an owner can cancel only through the unavailable-item / unmet-note confirmation flow, or after the customer chose to continue. In every other case the owner rejects the order while it is PLACED.
- **Drone failure:** when an admin marks a drone failed mid-flight, the order is flagged for intervention. The admin can then return it to READY_FOR_DRONE for a new drone, or cancel it.
- **Drone battery:** a drone can be loaded only if its battery covers both `DRONE_MIN_BATTERY` and the estimated trip (plus a small reserve). Admins recharge drones manually from the fleet page.
- **Chat:** the admin can read any order chat but cannot post. Chat closes once an order reaches a final state.
- **Search:** restaurant search matches restaurant names, restaurant categories, and the names/categories of available menu items. The category filter matches restaurant categories or menu-item categories.
- **Hashing:** `bcryptjs` is used instead of native `bcrypt` to avoid native build issues on Windows.
- **Reviews:** only the customer who collected an order can review it, once. The restaurant's average and count are recalculated on every new review. Insights day buckets are in UTC.
- **Out of scope:** refresh tokens, email/SMS, maps and online payment are not implemented.