# GoodPanda

GoodPanda is a drone-delivery food marketplace MVP. Customers order from local restaurants; drones fly the food to a pickup hub where the customer collects it with a one-time code and pays in cash. The platform serves three actors — **Customer**, **Restaurant Owner**, and **Admin** — plus a scoped **Hub Operator** role, with full role-based access control on both the API and the frontend.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Running locally](#running-locally)
   - [Option A: in-memory MongoDB (no install)](#option-a-in-memory-mongodb-no-install)
   - [Option B: real MongoDB](#option-b-real-mongodb)
   - [Option C: Docker Compose](#option-c-docker-compose)
5. [Environment variables](#environment-variables)
6. [Seeded accounts](#seeded-accounts)
7. [Demo dataset (optional)](#demo-dataset-optional)
8. [Features](#features)
   - [Customers](#customers)
   - [Restaurant owners](#restaurant-owners)
   - [Admins](#admins)
   - [Hub operators](#hub-operators)
   - [Shared platform features](#shared-platform-features)
9. [Order lifecycle (state machine)](#order-lifecycle-state-machine)
10. [API reference](#api-reference)
    - [Auth](#auth)
    - [Public](#public)
    - [Owner](#owner)
    - [Orders](#orders)
    - [Coupons](#coupons)
    - [Payments](#payments)
    - [Drones (hardware telemetry)](#drones-hardware-telemetry)
    - [Notifications](#notifications)
    - [Admin](#admin)
    - [Errors](#errors)
11. [Socket.IO events](#socket-io-events)
12. [Directory structure](#directory-structure)
13. [Testing](#testing)
14. [Assumptions and ambiguities](#assumptions-and-ambiguities)
15. [CI / deployment](#ci--deployment)

---

## Project overview

GoodPanda is a **Foodpanda-style food marketplace where delivery is by drone to pickup hubs**, not to the customer's door. The flow:

1. A customer browses restaurants, builds a cart (single or multi-restaurant), picks a drone delivery hub, and checks out.
2. The restaurant owner accepts the order, prepares the food, loads it onto a drone and dispatches it.
3. The drone flies to the hub (simulated with tick-based movement, battery drain and return-to-base). The customer gets a 6-digit pickup code and a QR token.
4. The customer collects the order at the hub. A hub operator or admin verifies the code/QR and marks it collected; cash is recorded as paid.

The backend is a Node.js + Express API with MongoDB/Mongoose and Socket.IO for real-time updates. The frontend is a React (Vite) SPA with React Router, Context state, Axios and socket.io-client.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Context, Axios, socket.io-client, Leaflet (live map), jsQR (QR scanning), qrcode.react |
| Styling | CSS Modules + design tokens (`client/src/styles/tokens.css`), CSS custom properties |
| Backend | Node.js, Express.js, Mongoose (MongoDB), Socket.IO |
| Auth | JWT (access token) + bcryptjs password hashing; role-based access control middleware |
| Validation | zod on all request bodies |
| Image upload | multer (memory storage, 2 MB cap, image-mime filter); pluggable storage (local disk or ImgBB) |
| Real-time | Socket.IO (JWT-authenticated handshake, per-user / per-order / per-hub / admin rooms) |
| Notifications | In-app persistence + socket emit; optional Web Push (VAPID) and optional Twilio SMS |
| Payments | Cash on collection (default); optional Stripe Checkout redirect with signed webhook capture |
| Tests | Vitest + Supertest + mongodb-memory-server (server); Vitest + Testing Library (client) |
| CI | GitHub Actions (server tests + client build) |

---

## Repository layout

```
GoodPanda/
├── README.md
├── FEATURE-EXPLORATION.md      # audit findings, defect log and v2 roadmap
├── .github/workflows/ci.yml    # CI: server tests + client build
├── docker-compose.yml          # MongoDB + API + nginx-served client
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── vitest.config.js
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── .env
│   ├── public/                 # sw.js (PWA / push), manifest, favicon
│   └── src/
│       ├── App.jsx             # route definitions + role guards
│       ├── main.jsx            # entry point (I18nProvider, providers)
│       ├── i18n/               # EN/BN translation module
│       │   ├── index.js        # translation strings
│       │   └── useI18n.jsx     # useTranslation hook + I18nProvider
│       ├── api/                # axios client + typed API methods (authApi, orderApi, adminApi, …)
│       ├── components/
│       │   ├── layout/         # Shell, Layouts (DashboardLayout/RoleLayout/PublicLayout), AnnouncementBanner, NotificationBell, UserMenu, Logo, PageHeader, SkipLink
│       │   ├── ui/             # design system: Button, Card, Table, Field/Input, Toggle, Select, Badge, StatusPill, InfoTooltip, Modal/Drawer, ConfirmDialog, Toast, Skeleton, EmptyState, ErrorState, Form, Icons
│       │   ├── cart/           # CartDrawer, CartLine
│       │   ├── order/          # OrderChat, OrderJourney, OrderTimeline, OrderSummaryCard, PickupCodeCard, QrScanner, LiveMap, DroneFlightPanel, ConfirmationBanner, OrderChat, BrowserNotificationsPrompt
│       │   ├── owner/          # OwnerOrderCard, OwnerOrderBrief, ConfirmationRequest, DroneDispatchPanel, ConfirmDialog
│       │   ├── profile/        # NotificationPrefs, AccountPrivacy, Referrals
│       │   └── restaurant/     # FavoriteButton, ReviewItem, ReviewsSection
│       ├── context/            # AuthContext, CartContext, SocketContext
│       ├── hooks/              # useAsync, useAction, useOrder, useReorder, useAddToCart, useChatUnread, useBrowserNotifications, usePageTitle, useDismiss, useMediaQuery, useScrollSpy
│       ├── pages/
│       │   ├── public/         # RestaurantList, RestaurantDetail, Auth (Login/Register/Profile), NotFound
│       │   ├── customer/       # Checkout, MyOrders, Notifications
│       │   ├── orders/         # OrderPage, Receipt, CustomerActions, OwnerActions, AdminActions
│       │   ├── owner/          # OwnerRestaurant, OwnerMenu, OwnerOrders, OwnerInsights, OwnerReviews, OwnerEarnings
│       │   ├── admin/          # AdminDashboard, AdminOrders, AdminPickup, AdminManage (AdminRestaurants/AdminUsers/AdminSettings/AdminAudit/AdminHubStaff/AdminFleet/AdminFleetHealth), AdminPayouts, AdminCoupons, AdminCampaigns, AdminDisputes
│       │   └── hub/            # HubQueue
│       ├── styles/             # tokens.css, base.css
│       └── utils/              # format.js, status.js, drone.js
│       └── e2e/                # Playwright order-flow spec
│       └── tests/              # Vitest unit tests
├── server/
│   ├── package.json
│   ├── vitest.config.js
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env / .env.example
│   ├── scripts/smoke.mjs
│   └── src/
│       ├── index.js            # process entry (unhandled-rejection guard, startServer)
│       ├── server.js           # HTTP server, Socket.IO init, flight resume, scheduler
│       ├── app.js              # Express app, middleware, route mounting
│       ├── config/             # db.js (Mongoose connection), env.js (all env vars)
│       ├── middleware/         # auth.js (signToken/authenticate/authorize/optionalAuth/droneKeyAuth), validate.js, error.js, upload.js, rateLimit.js, logger.js
│       ├── realtime.js         # Socket.IO wrapper: emitToUser/emitToAdmins/emitToHub/emitToOrder/disconnectUser
│       ├── socket/index.js     # Socket.IO connection, JWT handshake, order:join/order:leave
│       ├── models/             # User, Restaurant, MenuItem, Hub, Drone, Order, Review, Message, Notification, PushSubscription, AuditLog, Setting, Campaign, Coupon, Dispute, Referral
│       ├── routes/             # auth.routes, restaurant.routes, order.routes, admin.routes
│       ├── controllers/        # auth, restaurant, review, menu, order, delivery, drone, admin, notification, payment
│       ├── services/
│       │   ├── auth.service.js             # register/login/profile/password/avatar/favorites/export/delete/notification-prefs/referral ensure+apply
│       │   ├── order.service.js            # createOrder/createGroup/recalc/applyCommission/transition/announce/confirmation flows/cancellation/chat/load/dispatch/arrival/collect/receipt/paymentLink/reportNoShow
│       │   ├── orderStateMachine.js        # TRANSITIONS matrix / assertTransition / applyTransition / isFinal / awaitingPartyOf
│       │   ├── delivery.service.js         # atomic drone claim / load / dispatch / startFlight (SimulatedFlightController) / handleArrival / collect / resumeFlights / markDroneFailed / ingestTelemetry / charging dispatch
│       │   ├── delivery/drone/             # SimulatedFlightController, SimulatedChargingController, index (flightController singleton)
│       │   ├── payment.service.js          # CASH_ON_COLLECTION / ONLINE_PAYMENT methods; Stripe Checkout session; webhook construction & handling
│       │   ├── coupon.service.js           # quoteCoupon / redeemCoupon / releaseCoupon / CRUD
│       │   ├── referral.service.js         # ensureReferralCode / applyInvite / rewardReferralOnFirstOrder / stampLoyalty / referralsFor / refundCredit
│       │   ├── campaign.service.js         # segmentUsers / previewCampaign / sendCampaign
│       │   ├── dispute.service.js          # openDispute / listMine / listForOrder / listAll / resolveDispute
│       │   ├── setting.service.js          # fee config / announcement / priceDeliveryFee
│       │   ├── notification.service.js     # notify / notifyAdmins / notifyHubStaff / preference-aware fan-out (socket + push + SMS)
│       │   ├── push.service.js / sms.service.js / email.service.js   # optional channel adapters
│       │   ├── storage.service.js          # local disk or ImgBB backend
│       │   ├── audit.service.js            # audit entry creation + listing
│       │   ├── admin.service.js            # fleet/users/hubs/drones CRUD, payouts, dashboard, fleet health
│       │   ├── restaurant.service.js       # public/owner listings, insights, earnings, document upload/verify
│       │   ├── review.service.js           # review CRUD, owner replies, rating recompute
│       │   └── menu.service.js             # menu item CRUD
│       ├── validators/schemas.js           # all zod schemas
│       └── seed/                         # seedData.js (MVP dataset), seedDemo.js (demo dataset), seed.js, seedDemoCli.js, devMemory.js
└── tests/                        # Vitest: stateMachine, api, features, features2, fixes, regressions, demoSeed
```

---

## Running locally

Node 20+ is recommended. The project does not enforce an `engines` constraint; the installed Vite/Vitest tooling also permits Node 18.

Install dependencies once from the repository root:

```bash
cd server && npm install
cd ../client && npm install
```

### Option A: in-memory MongoDB (fastest, no MongoDB install)

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
# set MONGO_URI and a strong JWT_SECRET in .env
npm run seed                        # wipes and reseeds the database (MVP dataset)
npm run dev                         # API on http://localhost:5000
```

In terminal 2, start the client:

```bash
cd client && npm run dev
```

### Option C: Docker (MongoDB + API + built client)

```bash
docker compose up --build           # API on :5000, web app on http://localhost:8080
docker compose exec api npm run seed        # or: npm run seed:demo
```

Set `JWT_SECRET` (and optionally Stripe/email/VAPID keys) in the environment or a `.env` file next to `docker-compose.yml` before exposing it. nginx serves the SPA and proxies `/api`, `/socket.io` and `/uploads` to the API; uploads and MongoDB data live in named volumes.

---

## Environment variables

Server defaults from `server/src/config/env.js`:

| Variable | Default / behavior |
|---|---|
| `PORT` | `5000` |
| `NODE_ENV` | `development` |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/goodpanda` |
| `JWT_SECRET` | `dev-only-secret` in development; **required in production** |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_ORIGIN` | `http://localhost:5173` |
| `UPLOAD_DIR` | `uploads` |
| `IMGBB_API_KEY` | empty (local-disk uploads) |
| `DRONE_TICK_MS` | `1000` |
| `DRONE_SPEED_MPS` | `60` |
| `DRONE_BATTERY_PER_KM` | `2` |
| `DRONE_MIN_BATTERY` | `20` |
| `DRONE_BATTERY_RESERVE` | `5` (extra charge kept on top of the trip estimate) |
| `DRONE_RETURN_TO_BASE` | `true` (fly the empty drone back after drop-off) |
| `DRONE_CHARGING_TICK_MS` | `2000` |
| `DRONE_CHARGE_PERCENT_PER_TICK` | `10` |
| `DRONE_READY_CHARGE` | `60` (a docked drone rejoins the fleet at this charge) |
| `DRONE_APPROACHING_ETA_SECONDS` | `300` (one-off "5 minutes away" notification) |
| `DRONE_SERVICE_EVERY_TRIPS` | `25` (auto-flag a drone for maintenance; `0` disables) |
| `DEFAULT_DELIVERY_FEE` | `60` |
| `DELIVERY_FEE_MODE` | `flat` (`distance` adds `DELIVERY_FEE_PER_KM` per restaurant→hub km, capped by `DELIVERY_FEE_MAX`) |
| `DELIVERY_FEE_PER_KM` / `DELIVERY_FEE_MAX` | `10` / `300` |
| `MAX_DELIVERY_DISTANCE_KM` | `0` (disables the distance-zone refusal) |
| `PLATFORM_COMMISSION_PERCENT` | `10` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | empty (Web Push disabled; in-tab socket notifications still work). Generate with `npx web-push generate-vapid-keys` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | empty (online payment disabled; checkout shows "Not configured") |
| `EMAIL_API_KEY` / `EMAIL_FROM` / `EMAIL_API_URL` | empty (receipt emails are a no-op). Any Resend-compatible endpoint works |
| `LOG_REQUESTS` | `true` (set `false` to silence the JSON request log) |
| `DRONE_INGEST_KEY` | empty (hardware telemetry ingest disabled). Set a shared secret to accept `POST /drones/:id/telemetry` with an `x-drone-key` header |
| `DRONE_STALE_AFTER_SECONDS` | `120` (a hardware drone silent for longer is flagged stale in fleet health) |

Client defaults: `VITE_API_PROXY=http://localhost:5000` for the dev proxy, and an empty `VITE_API_URL` (same origin) for production builds. Tests override `NODE_ENV=test`, `JWT_SECRET=test-secret`, `DRONE_TICK_MS=20`, `DRONE_SPEED_MPS=100000`, `DRONE_CHARGING_TICK_MS=20` and `UPLOAD_DIR=uploads-test`.

### Image hosting (ImgBB)

Restaurant logos/covers, menu photos and profile pictures are uploaded to [ImgBB](https://imgbb.com) when `IMGBB_API_KEY` is set in `server/.env`, and the absolute ImgBB URL is stored. With the key left empty, uploads are stored on local disk in `UPLOAD_DIR` and served from `/uploads`. A failed ImgBB upload returns `502 UPLOAD_FAILED`; it does not silently fall back to local storage. Both providers go through `server/src/services/storage.service.js`, so switching providers is a single seam. Keep the key in `.env` only; it is gitignored.

The Vite dev server proxies `/api`, `/uploads` and `/socket.io` to the API, so you don't need to configure CORS during development. To point the client at a different API, set `VITE_API_PROXY` (or `VITE_API_URL` for a built client) in `client/.env`.

### Tests

```bash
cd server
npm test        # Vitest: state machine, API/RBAC, lifecycle, chat, reviews, favourites, account, browse, insights, regressions, fixes, feature tests

cd ../client
npm test        # Vitest + Testing Library: formatting, drone suitability, cart rules
npm run smoke   # with the API running: full live flow incl. cancel request, ETA, capacity, charging-aware fleet, audit
```

`npm run smoke` targets `http://localhost:5000/api` by default; override it with `SMOKE_BASE`. It walks a real order end-to-end: duplicate-line merging, cancellation request + decline, drone capacity/no-teleport checks, persisted dispatch ETA, live flight to the hub, return leg, 6-digit collection, audit log, last-admin guard and suspended-review hiding. Server tests cover 101 cases including QR-token pickup, receipts, distance pricing, hub/drone ratings, hub-operator scoping, fleet maintenance, Web Push degradation, payout recalculation, the payout ledger, scheduled-order release, notification preferences, Stripe webhook handling, privacy export/deletion, email receipts, recommendations, hardware telemetry, compliance documents, no-show handling, campaigns, coupons, disputes and multi-restaurant checkout. The client suite adds 10 cases for formatting, drone suitability and cart rules (including multi-restaurant carts and legacy migration).

---

## Seeded accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | admin@goodpanda.test | admin123 | Admins only come from the seed |
| Owner | owner1@goodpanda.test | owner123 | Panda Biryani House |
| Owner | owner2@goodpanda.test | owner123 | Green Leaf Cafe |
| Customer | customer@goodpanda.test | customer123 | |
| Hub operator | hub@goodpanda.test | hub123 | Scoped to Banani Drone Hub |

The seed also creates 3 hubs (Banani, Motijheel, Mirpur) and 4 drones with item capacities (12/12/24/6). GP-DR-04 starts at 15% battery: on startup it is docked automatically (`CHARGING`), tops itself up on the charging timer and rejoins the fleet once it crosses `DRONE_READY_CHARGE` (default 60%). Watch it live on the admin fleet page. To exercise the "no suitable drone" path, set a drone's battery below `DRONE_MIN_BATTERY` from the fleet page or put it in maintenance.

### Demo dataset (optional)

`npm run seed:demo` (or `DEMO_SEED=true npm run dev:memory`) seeds the accounts above **plus** a week of business so no screen is empty: six collected orders with reviews and a mix of pending/paid payouts, a `PLACED` and a `PREPARING` order, one order waiting at Banani Drone Hub with the known pickup code `246810` (and its QR token), a live `SAVE10` coupon, one open dispute and one resolved dispute. That makes the owner Insights/Earnings pages, the admin Payouts/Coupons/Disputes ledgers, the hub queue and the pickup-verification flow demo-ready without placing orders by hand.

---

## Features

### Customers

- Browse restaurants with search, category chips, *Open now*, *Saved* and sort (recommended / top rated / A–Z)
- **Picked for you** rail based on saved restaurants and past orders (guests see top rated/open)
- Save favourite restaurants; single or multi-restaurant cart with delivery-fee estimate and **coupon codes**
- Schedule an order for later (the restaurant only receives it at the chosen time)
- Pay **cash at the hub** or **online via Stripe Checkout** (when `STRIPE_SECRET_KEY` is configured)
- Apply store credit (referral/loyalty credit) at checkout
- Live Leaflet map with the drone's real position; order chat with the restaurant
- "5 minutes away" nudge and Web Push (tab closed, when VAPID keys are set)
- QR pickup code; printable **and emailable** receipt
- Rate food, hub and drone (once per collected order)
- **Report a problem** (dispute) after collection and track the outcome
- Request cancellation with owner confirmation; *Order again* refills the cart from a past order
- Full notifications page and per-channel notification preferences (in-app/push/SMS)
- Download your data (JSON export) or delete your account (soft delete)
- Profile photo and password change
- English / Bangla UI (language switcher in the user menu)

### Restaurant owners

- Menu and restaurant management (name, description, phone, address, categories, logo/cover, opening status, drone pickup coordinates)
- **Compliance document uploads** (food licence, trade licence, owner ID; admin-verified)
- Live order board grouped by status; drone loading/dispatch with capacity and battery checks
- **Insights**: food revenue, average order, average prep time, completion rate, 14-day sales chart, best sellers
- **Earnings**: pending vs paid payouts, platform fee, per-order statement
- **Reviews**: rating breakdown, *Needs reply* filter, public replies

### Admins

- Dashboard with order/fleet stats plus gross sales and delivery-fee revenue
- Restaurant approvals (with document verification), users (including **no-show counts**), hub operators
- Hubs, drones, distance-based delivery pricing, **Payouts** (collect-only ledger, mark a payout paid), **Coupons**, **Campaigns** (segmented in-app/push broadcasts), **Disputes** (review, resolve, record refunds)
- Platform-wide **banner** for announcements
- Audit log with CSV export
- Fleet health (scheduled service, battery history, lifetime usage, stale hardware telemetry)
- Pickup verification by 6-digit code or camera QR scan; return-to-base/charging controls

### Hub operators

Scoped to one hub — a **Hub queue** of orders waiting on the counter, flagged exceptions, and recent handovers; they verify pickups (code or QR) and can recover or cancel an order that is already with the drone, but not one the restaurant has not dispatched. They cannot manage users, fleet, hubs or settings; only super-admins retain those powers.

### Shared platform features

- Role-based access control on API and frontend; lazy-loaded routes; responsive design (breakpoints 640 / 768 / 1024 / 1280)
- Real-time Socket.IO notifications, order chat, drone telemetry
- Responsive design with CSS Modules + design tokens; English/Bangla (i18n)

---

## Web pages & actor features

Every route is lazy-loaded in `client/src/App.jsx` and guarded by role. Below is the complete page inventory, grouped by actor, with the features available on each page.

### Public pages (no login required)

| Page | Path | Features |
|---|---|---|
| Home / Restaurant list | `/` | Hero search by dish/restaurant name; category chips; *Open now* toggle; sort (recommended / top rated / name); *Picked for you* rail (saved restaurants → past orders → top rated/open); *Saved* filter; restaurant cards with open/closed badge |
| Restaurant detail | `/restaurants/:id` | Menu grouped by category; item notes; add-to-cart; closed/unavailable states; category scroll-spy; reviews section; drone pickup coordinates |
| Login | `/login` | Customer / owner registration and login; referral code field on register |
| Profile | `/profile` | Name/phone/address edit; avatar upload/remove; password change; notification preferences; **referrals & loyalty** (code, credit balance, stamps, invite history); **your data** (export/delete account) |
| Not found | `*` | 404 page |

### Customer pages (authenticated, role: `customer`)

| Page | Path | Features |
|---|---|---|
| Checkout | `/checkout` | Single or multi-restaurant cart; hub picker; distance-based fee estimate; per-item notes; order-level note; coupon code apply/remove; store credit toggle; schedule-for-later slot picker; cash-on-collection or online payment (when configured); place order |
| My orders | `/orders` | Active / Past / All tabs; server-side pagination + load older; status filter; socket upserts; status toasts; reorder from past orders |
| Order tracking | `/orders/:id` | 7-step journey timeline with timestamps; confirmation banner (item unavailable / note unmet); pickup code card (QR + copy + Google Maps directions); drone flight panel + live Leaflet map + telemetry; order summary; order chat; customer actions (cancel while PLACED, request cancellation after accept, report a problem); printable & emailable receipt |
| Receipt | `/orders/:id/receipt` | Printable cash-reconciliation receipt (subtotal, coupon discount, delivery fee, total, payment status, collected by, timeline); email receipt button |

### Owner pages (authenticated, role: `owner`)

| Page | Path | Features |
|---|---|---|
| My restaurant | `/owner` | Restaurant profile create/update (name, description, phone, address, categories, logo/cover, opening status, drone pickup coordinates); PENDING/SUSPENDED banners |
| Menu | `/owner/menu` | Menu item CRUD (name, description, price, category, image, availability toggle); category filter |
| Orders | `/owner/orders` | Live order board grouped by New / In progress / Waiting / Drone / Completed; new-order toasts; order actions (accept → preparing → ready → drone load/dispatch; reject with reason; confirmation requests; cancellation-request response) |
| Insights | `/owner/insights` | Revenue, average order, orders today, prep time, completion rate, flight time; 14-day bar chart; best sellers; rating breakdown; status counts; socket refresh |
| Earnings | `/owner/earnings` | Pending vs paid payouts; platform fee; per-order statement (subtotal, commission, payout amount, status, collected at) |
| Reviews | `/owner/reviews` | Rating summary; filters (all / needs reply / stars); reply create/edit/delete |
| Compliance documents | (tab on My restaurant) | Upload food licence / trade licence / owner ID; view expiry; admin-verified badges |

### Admin pages (authenticated, role: `admin`)

| Page | Path | Features |
|---|---|---|
| Dashboard | `/admin` | Order/drone/approval/intervention counters; gross sales; delivery-fee revenue; recent order list; fleet status counts; quick links |
| Orders | `/admin/orders` | Server-side status/priority/debounced search; pagination; *Verify* shortcut to pickup page |
| Pickup verify | `/admin/pickup` | Order picker; 6-digit code entry; camera QR scan (jsQR); confirm dialog; success/error feedback |
| Payouts | `/admin/payouts` | Collect-only ledger; status/restaurant/pagination filters; pending total; mark payout paid (with confirmation) |
| Coupons | `/admin/coupons` | Coupon CRUD (code, type, value, min subtotal, max discount, restaurant scope, active window, usage limits, per-customer limit) |
| Campaigns | `/admin/campaigns` | Segmented in-app/push broadcast composer (all customers / active 30d / lapsed 30d / all owners / all users); preview with reach + sample; history |
| Disputes | `/admin/disputes` | Customer dispute queue; resolve / reject; refund amount validation against order total; refund amount recorded on order |
| Restaurants | `/admin/restaurants` | Approve/suspend; document verification (verify/reject compliance documents with notes) |
| Users | `/admin/users` | Activate/deactivate (self excluded; last-admin guard); hub-operator creation; no-show counts |
| Hub operators | `/admin/hub-staff` | Hub-scoped staff account management |
| Hubs | `/admin/hubs` | Hub CRUD (name, address, location, active flag) |
| Drones | `/admin/drones` | Drone CRUD (identifier, battery, capacity, location, status, maintenance); mark failed; service scheduling; battery history |
| Fleet health | `/admin/fleet-health` | Upcoming service; battery trend; lifetime usage; stale telemetry flag |
| Audit log | `/admin/audit` | Admin mutation trail (who did what, when, to what); CSV export |
| Settings | `/admin/settings` | Delivery fee (flat/distance, per-km, cap, max distance); platform commission; platform-wide announcement banner (message, tone, active) |

### Hub operator pages (authenticated, role: `hub_operator`)

| Page | Path | Features |
|---|---|---|
| Hub queue | `/hub` | Orders waiting at the operator's hub (arrived at hub); cash due per order; flagged exceptions (no-show / intervention); recent handovers; pickup verification (6-digit code or QR scan); back to hub queue |
| Pickup verify | `/admin/pickup` | Order picker scoped to operator's hub; 6-digit code entry; camera QR scan; confirm dialog; back to hub queue |

### Shared real-time / platform features (all signed-in actors)

| Feature | Location | Description |
|---|---|---|
| Socket.IO notifications | `context/SocketContext.jsx` | Token-authenticated socket; events `notification`, `order:new`, `order:updated`, `drone:location`, `drone:updated`, `chat:message`, `payment:updated`; desktop notifications only when tab hidden |
| Notification bell | `components/layout/NotificationBell.jsx` | Popover with unread badge; mark-all-read; deep links to order/profile |
| Order chat | `components/order/OrderChat.jsx` | REST history + socket room join/leave; optimistic sends; day grouping; unread badge; read-only when final/admin |
| Live map | `components/order/LiveMap.jsx` | react-leaflet + OSM tiles; restaurant/drone/hub markers; dashed route; auto fit-bounds; offline-tile fallback |
| QR scanner | `components/order/QrScanner.jsx` | Camera QR scan (jsQR) for hub staff pickup verification |
| Cart drawer | `components/cart/CartDrawer.jsx` | Single or multi-restaurant cart; item notes; quantity stepper; clear; per-restaurant grouping |
| Drone dispatch panel | `components/owner/DroneDispatchPanel.jsx` | Client-side drone suitability + battery estimate; load/dispatch |
| Status pills | `components/ui/StatusPill.jsx` | Centralised status labels/colors in `utils/status.js` |

---

## Order lifecycle (state machine)

```text
Happy path:
PLACED → ACCEPTED → PREPARING → READY_FOR_DRONE → IN_FLIGHT → ARRIVED_AT_HUB → COLLECTED

Owner:
PLACED → REJECTED
PLACED / ACCEPTED / PREPARING → NEEDS_CUSTOMER_CONFIRMATION (item unavailable / note unmet, or a customer cancel request)
NEEDS_CUSTOMER_CONFIRMATION → CANCELLED
NEEDS_CUSTOMER_CONFIRMATION (awaiting owner, cancel request) → previous status (declined)
ACCEPTED / PREPARING → CANCELLED only after the customer continued

Customer:
PLACED → CANCELLED
ACCEPTED / PREPARING → NEEDS_CUSTOMER_CONFIRMATION (cancel request; the owner answers)
NEEDS_CUSTOMER_CONFIRMATION (awaiting customer) → previous status or CANCELLED

Admin:
PLACED / ACCEPTED / PREPARING / READY_FOR_DRONE / IN_FLIGHT / ARRIVED_AT_HUB → CANCELLED
IN_FLIGHT → READY_FOR_DRONE (recovery after drone failure)
ARRIVED_AT_HUB → COLLECTED

System:
IN_FLIGHT → ARRIVED_AT_HUB
```

All transitions live in `server/src/services/orderStateMachine.js`:
- An invalid transition returns `409 INVALID_TRANSITION`.
- A transition the caller's role can't make returns `403 TRANSITION_FORBIDDEN`.
- Every change is appended to `statusHistory`.
- Concurrent edits are rejected through optimistic concurrency (`409 CONCURRENT_UPDATE`).
- Drones are claimed atomically, so two orders can never load the same drone.
- A hub operator may only cancel/recover an order that is already `READY_FOR_DRONE` or later; before that the restaurant and admin own the decision.

### Scheduled orders

Checkout can hold an order for a later slot. The order is stored as `PLACED` with `scheduledFor` and hidden from the restaurant's list until that time; a scheduler tick (every 30 s, also on boot) then notifies both parties once and the normal lifecycle continues. Cancelling still works while it is `PLACED`.

---

## API reference (all under `/api`)

Errors always look like `{ "error": { "message", "code", "details?", "requestId" } }`.

### Auth

| Endpoint | Method | Description |
|---|---|---|
| `/auth/register` | POST | customer or owner (`name`, `email`, `password`, `phone`, `address`, `role`, optional `referralCode`) |
| `/auth/login` | POST | returns JWT + user |
| `/auth/logout` | POST | authenticated; token discarded client-side |
| `/auth/me` | GET/PATCH | current user (PATCH: `name`, `phone`, `address`) |
| `/auth/me/notifications` | PATCH | notification prefs (`inApp`, `push`, `sms` booleans) |
| `/auth/me/password` | POST | `currentPassword`, `newPassword` |
| `/auth/me/avatar` | PUT/DELETE | multipart `avatar` |
| `/auth/me/export` | GET | JSON download of profile, orders, reviews, notifications |
| `/auth/me/delete` | DELETE | customer soft-delete; refused while orders are active |
| `/auth/me/favorites` | GET | customer favourites |
| `/auth/me/favorites/:id` | PUT/DELETE | add/remove favourite restaurant |
| `/auth/me/referrals` | GET | own code, credit balance, loyalty stamps/rewards, invite history |
| `/auth/push/config` | GET | public; VAPID public key |
| `/auth/me/push` | POST/DELETE | subscribe/unsubscribe (endpoint + keys) |

### Public

| Endpoint | Method | Description |
|---|---|---|
| `/restaurants` | GET | `q`, `category`, `openNow=true`, `sort=recommended\|rating\|name` |
| `/restaurants/recommended` | GET | `limit=`; personalised when a token is sent (saved → past orders → top rated/open) |
| `/restaurants/:id` | GET | restaurant + menu |
| `/restaurants/:id/reviews` | GET | public reviews (approved restaurants only) |
| `/hubs` | GET | active hubs |
| `/settings/public` | GET | delivery pricing, `onlinePaymentEnabled`, active platform banner (commission rate not exposed) |

### Owner

| Endpoint | Method | Description |
|---|---|---|
| `/owner/restaurant` | GET/POST/PATCH | profile (multipart `logo`/`cover`) |
| `/owner/restaurant/open` | PATCH | `isOpen` |
| `/owner/insights` | GET | revenue, prep/flight times, completion rate, 14-day chart, best sellers |
| `/owner/earnings` | GET | pending vs paid payouts, platform fee, per-order statement |
| `/owner/reviews` | GET/POST(:id/reply) | list / reply |
| `/owner/menu` | GET/POST | list/create item |
| `/owner/menu/:id` | PATCH/DELETE | update/delete item |
| `/owner/menu/:id/availability` | PATCH | `isAvailable` |
| `/drones/available` | GET | drones claimable for delivery |
| `/owner/restaurant/documents` | POST | multipart `document` + `type`/`label`/`expiresAt` |
| `/owner/restaurant/documents/:docId` | DELETE | remove own document |

### Orders

| Endpoint | Method | Description |
|---|---|---|
| `/orders` | POST | `restaurantId`, `hubId`, `items[]`, `customerNote`, `paymentMethod`, `scheduledFor`, `couponCode`, `useCredit` |
| `/orders/group` | POST | 2–5 restaurant groups, one hub, cash-only, no coupons; creates one `PLACED` order per restaurant sharing `checkoutGroup` |
| `/orders` | GET | `page`, `limit`, `status`, `needsIntervention`, `q`; scoped to caller role; admins can search |
| `/orders/:id` | GET | order detail (role-scoped serialization) |
| `/orders/:id/status` | PATCH | `status` (+ `reason`); owner accept/reject/prepare/ready; admin force-cancel/recover; customer cancel while PLACED |
| `/orders/:id/confirmation-request` | POST | owner: `type` (`ITEM_UNAVAILABLE`\|`NOTE_UNMET`), `message`, `itemIds[]` |
| `/orders/:id/confirmation-response` | POST | customer: `decision` (`CONTINUE`\|`CANCEL`) |
| `/orders/:id/cancel-request` | POST | customer: `message` (while ACCEPTED/PREPARING) |
| `/orders/:id/cancel-response` | POST | owner: `decision` (`CONTINUE`\|`CANCEL`) + `reason` |
| `/orders/:id/messages` | GET/POST | order chat |
| `/orders/:id/load-drone` | POST | owner: `{ droneId }` |
| `/orders/:id/unload-drone` | POST | owner |
| `/orders/:id/dispatch` | POST | owner |
| `/orders/:id/collect` | POST | admin/hub_operator: `{ pickupCode }` or `{ pickupToken }`; marks PAID |
| `/orders/:id/receipt` | GET | customer; printable receipt data for COLLECTED order |
| `/orders/:id/receipt/email` | POST | customer; resends receipt email (`{sent, configured}`) |
| `/orders/:id/payment-link` | POST | customer; returns `{url}` for an unpaid online order |
| `/orders/:id/review` | POST | customer, once per COLLECTED order; `rating`, optional `hubRating`/`droneRating`, `comment` |
| `/orders/:id/disputes` | POST/GET | customer: open dispute (`category`, `description`); list disputes for order |

### Coupons

| Endpoint | Method | Description |
|---|---|---|
| `/coupons/validate` | POST | customer: `{code, restaurantId, subtotal}` → `{discount, type, value}`; order endpoint revalidates authoritatively |
| `/admin/coupons` | GET/POST | list / create (`code`, `type`, `value`, `minSubtotal`, `maxDiscount`, `restaurant`, `active`, `startsAt`, `endsAt`, `usageLimit`, `perCustomerLimit`, `description`) |
| `/admin/coupons/:id` | PATCH | update fields |

### Payments

| Endpoint | Method | Description |
|---|---|---|
| `/payments/webhook` | POST | Stripe only; raw body + `stripe-signature`. `checkout.session.completed` is the sole trigger that marks an order PAID |

### Drones (hardware telemetry)

| Endpoint | Method | Description |
|---|---|---|
| `/drones/:id/telemetry` | POST | `x-drone-key` shared secret; body `{lat,lng,battery?,status?,seq?}`; out-of-order `seq` values ignored; fanned out as live `drone:location` telemetry |

### Notifications

| Endpoint | Method | Description |
|---|---|---|
| `/notifications` | GET | `page`, `limit=`; scoped to caller |
| `/notifications/:id/read` | PATCH | mark one read |
| `/notifications/read-all` | POST | mark all read |

### Admin

| Endpoint | Method | Description |
|---|---|---|
| `/admin/dashboard` | GET | order/fleet stats, gross sales, delivery-fee revenue |
| `/admin/restaurants` | GET | list (status filter) |
| `/admin/restaurants/:id/status` | PATCH | `APPROVED`/`SUSPENDED` |
| `/admin/restaurants/:id/documents/:docId` | PATCH | verify/reject compliance document (`verified`, `note`) |
| `/admin/users` | GET | list (`role` filter) |
| `/admin/users/hub-operator` | POST | create hub-scoped staff account |
| `/admin/users/:id/active` | PATCH | activate/deactivate (last active admin protected) |
| `/admin/hubs` | GET/POST/DELETE | CRUD |
| `/admin/hubs/:id` | PATCH/DELETE | update/delete |
| `/admin/drones` | GET/POST/DELETE | CRUD |
| `/admin/drones/:id` | PATCH | update/maintenance/service |
| `/admin/drones/:id/fail` | POST | mark failed |
| `/admin/drones/health` | GET | fleet health (service schedule, battery history, lifetime usage, stale telemetry) |
| `/admin/settings` | GET/PUT | `deliveryFee`, `mode`, `perKm`, `max`, `maxDeliveryDistanceKm`, `platformCommissionPercent`, `announcement` |
| `/admin/payouts` | GET | `status`, `restaurantId`, `page`, `limit`; collected orders only; `{ items, page, limit, total, pages, pendingTotal }` |
| `/admin/payouts/:id/paid` | PATCH | mark payout paid (collected + pending only) |
| `/admin/disputes` | GET | `status` filter |
| `/admin/disputes/:id` | PATCH | `status` (`RESOLVED`\|`REJECTED`), `resolution`, `refundAmount`, `note` |
| `/admin/campaigns` | GET/POST | list / send (`title`, `body`, `segment`) |
| `/admin/campaigns/preview` | POST | `{segment}` → reach + sample |
| `/admin/coupons` | GET/POST | coupon CRUD |
| `/admin/coupons/:id` | PATCH | update coupon fields |
| `/admin/audit-logs` | GET | `action`, `targetType`, `limit` |

Auth, order creation, chat, uploads and pickup-code attempts are rate-limited (disabled under `NODE_ENV=test`).

---

## Socket.IO events

Connect with the JWT as `auth.token`. Hub operators join a hub-scoped room (not the platform-wide admin room), so they never receive other hubs' orders, chats or telemetry.

| Event | Direction | Description |
|---|---|---|
| `notification` | server→client | new in-app notification |
| `order:new` | server→client | new order for owner/hub staff/admins |
| `order:updated` | server→client | order status change (role-scoped serialization) |
| `chat:message` | server→client | new chat message |
| `drone:location` | server→client | live telemetry (simulated or hardware) |
| `drone:updated` | server→client | drone status change |
| `payment:updated` | server→client | customer: Stripe webhook confirmed payment |
| `order:join` / `order:leave` | client→server | subscribe/unsubscribe to an order room (participant check enforced) |

---

## Directory structure

### Client (`client/src`)

```
App.jsx               # route definitions + role guards
main.jsx              # entry point (I18nProvider, providers)
i18n/                 # EN/BN translation
  index.js            # translation strings (~320 keys)
  useI18n.jsx         # useTranslation hook + I18nProvider
api/                  # typed API methods (authApi, orderApi, adminApi, restaurantApi, hubApi, settingsApi, couponApi, notificationApi)
components/
  layout/             # Shell, Layouts (DashboardLayout/RoleLayout/PublicLayout), AnnouncementBanner, NotificationBell, UserMenu, Logo, PageHeader, SkipLink
  ui/                 # Button, Card, Table, Field/Input, Toggle, Select, Badge, StatusPill, InfoTooltip, Modal/Drawer, ConfirmDialog, Toast, Skeleton, EmptyState, ErrorState, Form, Icons
  cart/               # CartDrawer, CartLine
  order/              # OrderChat, OrderJourney, OrderTimeline, OrderSummaryCard, PickupCodeCard, QrScanner, LiveMap, DroneFlightPanel, ConfirmationBanner, BrowserNotificationsPrompt
  owner/              # OwnerOrderCard, OwnerOrderBrief, ConfirmationRequest, DroneDispatchPanel
  profile/            # NotificationPrefs, AccountPrivacy, Referrals
  restaurant/         # FavoriteButton, ReviewItem, ReviewsSection
context/              # AuthContext, CartContext, SocketContext
hooks/                # useAsync, useAction, useOrder, useReorder, useAddToCart, useChatUnread, useBrowserNotifications, usePageTitle, useDismiss, useMediaQuery, useScrollSpy
pages/
  public/             # RestaurantList, RestaurantDetail, Auth (Login/Register/Profile), NotFound
  customer/           # Checkout, MyOrders, Notifications
  orders/             # OrderPage, Receipt, CustomerActions, OwnerActions, AdminActions
  owner/              # OwnerRestaurant, OwnerMenu, OwnerOrders, OwnerInsights, OwnerReviews, OwnerEarnings
  admin/              # AdminDashboard, AdminOrders, AdminPickup, AdminManage, AdminPayouts, AdminCoupons, AdminCampaigns, AdminDisputes
  hub/                # HubQueue
styles/               # tokens.css (design system), base.css
utils/                # format.js, status.js, drone.js
e2e/                  # Playwright order-flow.spec.js
tests/                # Vitest unit tests
```

### Server (`server/src`)

```
index.js              # process entry (unhandled-rejection guard, startServer)
server.js             # HTTP server, Socket.IO init, flight resume, order scheduler
app.js                # Express app, middleware, route mounting
config/
  db.js               # Mongoose connection
  env.js              # all env vars with defaults
middleware/
  auth.js             # signToken/authenticate/authorize/optionalAuth/droneKeyAuth
  validate.js         # zod middleware
  error.js            # error handler + notFound (requestId in payloads)
  upload.js           # multer (memory, 2 MB, image-mime filter)
  rateLimit.js        # auth/order/message/pickup rate limiting
  logger.js           # structured JSON request logger with X-Request-Id
realtime.js           # Socket.IO wrapper
socket/index.js       # JWT handshake, order:join/order:leave
models/
  User.js             # roles, hub, notificationPrefs, creditBalance, loyaltyStamps/Rewards, referralCode, referredBy, deletedAt
  Restaurant.js       # documents[] (compliance), ratingAvg/Count
  MenuItem.js, Hub.js, Drone.js (capacityUnits, batteryHistory, telemetry), Order.js (commission/payout, coupon, credit, pickup secrets, scheduledFor)
  Review.js, Message.js, Notification.js, PushSubscription.js, AuditLog.js, Setting.js
  Campaign.js, Coupon.js, Dispute.js, Referral.js
controllers/          # auth, restaurant, review, menu, order, delivery, drone, admin, notification, payment, coupon, dispute, campaign
routes/               # auth.routes, restaurant.routes, order.routes, admin.routes
services/
  auth.service.js             # register/login/profile/password/avatar/favorites/export/delete/notification-prefs/referral ensure+apply
  order.service.js            # createOrder/createGroup/recalc/applyCommission/transition/announce/confirmation flows/cancellation/chat/load/dispatch/arrival/collect/receipt/paymentLink/reportNoShow
  orderStateMachine.js        # TRANSITIONS matrix / assertTransition / applyTransition / isFinal / awaitingPartyOf
  delivery.service.js         # atomic drone claim / load / dispatch / startFlight / handleArrival / collect / resumeFlights / markDroneFailed / ingestTelemetry
  delivery/drone/             # SimulatedFlightController, SimulatedChargingController, index (flightController singleton)
  payment.service.js          # CASH_ON_COLLECTION / ONLINE_PAYMENT methods; Stripe Checkout session; webhook construction & handling
  coupon.service.js           # quoteCoupon / redeemCoupon / releaseCoupon / CRUD
  referral.service.js         # ensureReferralCode / applyInvite / rewardReferralOnFirstOrder / stampLoyalty / referralsFor / refundCredit
  campaign.service.js         # segmentUsers / previewCampaign / sendCampaign
  dispute.service.js          # openDispute / listMine / listForOrder / listAll / resolveDispute
  setting.service.js          # fee config / announcement / priceDeliveryFee
  notification.service.js     # notify / notifyAdmins / notifyHubStaff / preference-aware fan-out (socket + push + SMS)
  push.service.js / sms.service.js / email.service.js   # optional channel adapters
  storage.service.js          # local disk or ImgBB backend
  audit.service.js            # audit entry creation + listing
  admin.service.js            # fleet/users/hubs/drones CRUD, payouts, dashboard, fleet health
  restaurant.service.js       # public/owner listings, insights, earnings, document upload/verify
  review.service.js           # review CRUD, owner replies, rating recompute
  menu.service.js             # menu item CRUD
validators/schemas.js         # all zod schemas
seed/                       # seedData.js (MVP), seedDemo.js (demo), seed.js, seedDemoCli.js, devMemory.js
tests/                      # Vitest: stateMachine, api, features, features2, fixes, regressions, demoSeed
```

---

## Testing

```bash
cd server
npm test        # Vitest: 101 tests across stateMachine, api, features, features2, fixes, regressions, demoSeed

cd ../client
npm test        # Vitest + Testing Library: 10 tests (format helpers, drone suitability, cart rules incl. multi-restaurant carts and legacy migration)
```

### E2E (Playwright)

A place → accept → prepare → dispatch → collect flow is specified in `client/e2e/order-flow.spec.js`. To run it:

```bash
cd client
npm install -D playwright   # (already installed)
npx playwright install chromium   # install browser binaries (first time only)
# start the API (Option A or B) and the client, then:
npx playwright test
```

---

## Assumptions and ambiguities

- **Drone location on load:** the drone flies from wherever it actually is — its position is not changed when food is loaded. The trip estimate covers drone → restaurant → hub.
- **Simulated flight:** flight is a straight-line simulation (`services/drone`). The `flightController` singleton backed by `SimulatedFlightController` is the seam for real routing or hardware. Speed, tick and battery drain are configured in `.env`. In-progress flights resume after a server restart. After drop-off the empty drone flies back toward the restaurant (`DRONE_RETURN_TO_BASE`) so the fleet does not pile up at hubs.
- **Dispatch ETA:** dispatch stores `estimatedArrivalAt` on the order and notifies the customer ("Arriving at {hub} in about N minutes"). The order page keeps showing the promise after a reload; live telemetry refines it while the tab is open. With browser notifications allowed, arrival alerts also fire while the tab is in the background.
- **Charging:** a landed drone below `DRONE_READY_CHARGE` docks itself (`CHARGING`) and charges on a timer until ready. Charging drones can still be claimed for a delivery — loading stops the dock timer. Returning a flat drone to service from the fleet page re-docks it instead of leaving it unusable.
- **Drone capacity:** each drone carries at most `capacityUnits` items; orders above a drone's capacity are refused at load time, and the owner's picker disables them with the reason.
- **Customer cancellation:** while the restaurant is preparing (ACCEPTED/PREPARING), the customer can request cancellation with a reason. The restaurant approves (order cancelled) or declines (order continues and the customer is told). Before acceptance the customer can cancel outright.
- **Hub operator:** hub staff are real accounts scoped to one hub (`User.hub`). They see only that hub's orders, verify pickups (code or QR) and clear exceptions on dispatched orders. They never receive another hub's orders, chats or telemetry.
- **Payments:** cash on collection is the default. When `STRIPE_SECRET_KEY` is set, checkout offers online payment: the order is created `PENDING`, the customer is redirected to a Stripe Checkout Session, and a signed webhook (`STRIPE_WEBHOOK_SECRET`) is the only thing that marks it `PAID`. A failed session creation rolls the order back rather than leaving an unpayable order. Without keys the option shows "Not configured".
- **Email:** receipt emails go through any Resend-compatible endpoint when `EMAIL_API_KEY` is set and are a no-op otherwise; collection never waits on the send.
- **Prices:** prices and the delivery fee are always computed on the server. The admin sets the delivery fee.
- **Owners:** each owner has exactly one restaurant. New restaurants need admin approval before they appear publicly.
- **Owner cancellation:** an owner can cancel only through the unavailable-item / unmet-note confirmation flow, or after the customer chose to continue. In every other case the owner rejects the order while it is PLACED.
- **Drone failure:** when an admin marks a drone failed mid-flight, the order is flagged for intervention. The admin can then return it to `READY_FOR_DRONE` for a new drone, or cancel it.
- **Drone battery:** a drone can be loaded only if its battery covers `DRONE_MIN_BATTERY` and the whole trip (drone → restaurant → hub) plus `DRONE_BATTERY_RESERVE`. Admins can also recharge drones manually from the fleet page; low drones otherwise charge themselves.
- **Audit trail:** admin mutations (hubs, drones, restaurant status, user activation, settings) are recorded in `AuditLog` and visible at `GET /api/admin/audit-logs`. The last active admin cannot be deactivated or demoted.
- **Chat:** the admin can read any order chat but cannot post. Chat closes once an order reaches a final state.
- **Search:** restaurant search matches restaurant names, restaurant categories, and the names/categories of available menu items. The category filter matches restaurant categories or menu-item categories.
- **Hashing:** `bcryptjs` is used instead of native `bcrypt` to avoid native build issues on Windows.
- **Reviews:** only the customer who collected an order can review it, once. The restaurant's average and count are recalculated on every new review. Insights day buckets are in UTC.
- **Commission & payouts:** the platform keeps `PLATFORM_COMMISSION_PERCENT` of each order's food subtotal (delivery fees stay with the platform). The payout is re-derived whenever the order total changes and is `VOID` for cancelled or rejected orders. Only `COLLECTED` orders can be marked paid, and each payout change is audited.
- **Out of scope:** refresh tokens/OAuth, coupon codes, multi-restaurant carts, real drone hardware integration and mobile apps. SMS, Web Push and email exist as optional adapters; the Leaflet map is read-only telemetry, not a routing engine; online payment requires your own Stripe keys to activate.
- **Hardware seam:** `services/drone/index.js` exposes the flight controller the rest of the app talks to, so simulated flight can be replaced by a real controller. Real drones can also push position/battery reports to `POST /api/drones/:id/telemetry` with `DRONE_INGEST_KEY`; reports are sequence-checked, fanned out as live telemetry, and a silent feed is flagged stale in Fleet health.
- **Multi-restaurant carts:** the cart can hold dishes from several restaurants. Checkout splits it into one order per restaurant (2–5), all to the same hub and sharing a `checkoutGroup` id. Each order gets its own drone, delivery fee and pickup code, so collection happens per order. Split orders are cash-only and do not accept coupons or online payment, because both are single-order flows; if any restaurant is closed, out of range or has an unavailable item the whole checkout is refused and nothing is created.
- **Privacy:** customers can download a JSON export of their account, orders, reviews and notifications, or delete their account. Deletion is a soft delete: personal fields are anonymised and the row is deactivated so order history and cash reconciliation stay intact. Staff accounts are removed by an admin.

---

## CI / deployment

`.github/workflows/ci.yml` runs on every push/PR:

1. **Server:** `npm ci` → `npm test` (Vitest + Supertest + mongodb-memory-server, with a cached mongod binary)
2. **Client:** `npm ci` → `npm test` → `npm run build`

`docker-compose.yml` provides a one-command local demo (MongoDB + API + nginx-served client) with named volumes for uploads and MongoDB data.

---

## Security notes

- JWTs are signed with `JWT_SECRET`. The development default (`dev-only-secret`) must never be used in production.
- Tokens are header-only, signature-verified, 7-day expiry; role is read from the DB (not the token). Tokens are never accepted from the query string.
- Passwords are hashed with bcryptjs (10 rounds) and never leave the server (`select: false`, stripped in `toJSON`).
- Uploads are memory-stored, 2 MB capped, image-mime filtered and stored under server-generated random filenames with path-traversal-safe deletion.
- Rate limiting covers auth, order creation/modification, chat, uploads and pickup-code attempts.
- Hub operators are scoped to their hub in both HTTP and Socket.IO; they cannot reach another hub's orders, chats or telemetry.
- The last active admin cannot be deactivated or demoted.
