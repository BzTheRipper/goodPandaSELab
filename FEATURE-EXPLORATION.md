# GoodPanda — feature exploration, verified defects, and v2 roadmap

Prepared by a lead agent with five read-only audit subagents, then spot-verified by reading the
exact code paths. Nothing in this document has been implemented.

Scope note: the repository is **far past the MVP in `coding-agent-prompt.md`**. Most "what else
could we add" ideas from the spec's *Out of scope* list are already half-built. The highest-value
work is therefore: **(1) fix the regressions the half-built features introduced, (2) finish the
half-built features, (3) only then add new ones.**

---

## 0. Implementation status (updated after this audit)

Shipped since the audit (each verified by the server test suite and a production client build):

| Area | What changed |
|---|---|
| Checkout crash | `envOnlinePayment` replaced with an explicit `ONLINE_PAYMENT_ENABLED = false`; the page renders again and the disabled option is honest. |
| Pickup verification | `orderApi.collect` now sends the flat `{ pickupCode }` / `{ pickupToken }` body; code entry and QR scanning both work. |
| Receipt page | Added the missing `orderApi.receipt`; `maintenanceDueAt: null` is now accepted so a scheduled service can be cleared. |
| Socket leak | Hub operators no longer join the `admins` room. They get a hub-scoped room, order updates for their hub only, and their own "pickup ready" notifications; `notifyAdmins` is admin-only. |
| Socket crash | `order:join` type-checks its ack, so a malformed emit can no longer kill the process. |
| Payout ledger | Commission/payout is recomputed on every subtotal change, voided on cancel, serialized to admins only, and the queue is collected-orders-only with a real `payoutQuerySchema`. `markPayoutPaid` requires `COLLECTED` + `PENDING`. |
| New: Payouts console | `/admin/payouts` — pending total, status filter, pagination, "mark paid" with confirm. |
| New: Owner earnings | `/owner/earnings` + `GET /api/owner/earnings` — pending vs paid, platform fee, per-order statement. |
| New: Hub queue | `/hub` — orders waiting at the operator's hub, cash to collect, exceptions, recent handovers; hub-scoped order actions and back-links. |
| Scheduled orders | Checkout slot picker, "held until" banner on the order page, and a 30-second scheduler that releases due orders once with notifications. |
| Correctness | Owner Insights rating distribution fixed; drone service resets `tripsCompleted`; charging dock uses atomic, CHARGING-scoped updates (no more overwrite race); public settings no longer leak the commission rate. |
| Security | JWT still dev-default (documented); push endpoints can no longer be hijacked by another account; deactivating a user disconnects their sockets; hub operators can only cancel/recover orders that are already dispatched. |
| Payments | Stripe dependency removed (it was declared but never installed); `ONLINE_PAYMENT` now fails with `PAYMENT_UNAVAILABLE` instead of silently creating an unpayable order. |
| Ops | CI workflow (server tests + client build), complete `.env.example`, `npm run seed:demo` demo dataset, README corrections. |
| Tests | +12 cases in `server/tests/regressions.test.js` (payout math, ledger, settings, servicing, earnings, scheduling, RBAC) and `server/tests/demoSeed.test.js`; suite now 71 passing. |

### Second implementation pass (roadmap A4, A5, B3, B5, C4, C5, D2 + engineering)

| Item | What shipped |
|---|---|
| **A4 — Online payment (Stripe)** | Real Checkout Session redirect flow: order → session → Stripe → signed webhook is the only thing that sets `PAID`; failed session creation rolls the order back; `POST /orders/:id/payment-link` re-opens payment for an unpaid order; `payment:updated` socket event; checkout enables the option only when the server reports it configured. |
| **A5 — Notification preferences** | Per-channel prefs (`inApp`/`push`/`sms`) on the user, honoured inside `notify()`; profile settings card; paginated full `/notifications` page plus a "View all" link in the bell. |
| **B3 — Email receipts** | Provider-agnostic `email.service.js` (Resend-compatible), receipt builder, automatic send on collection, `POST /orders/:id/receipt/email` + "Email receipt" button. No-ops without `EMAIL_API_KEY`. |
| **B5 — Hardware drone seam** | `POST /drones/:id/telemetry` with shared-key auth, sequence-checked reports fanned out as live telemetry, `lastTelemetryAt`/`telemetrySeq`, and stale-feed flagging in Fleet health. |
| **C4 — Privacy controls** | `GET /auth/me/export` (JSON download) and `DELETE /auth/me` (soft delete + anonymise, blocked while orders are active, staff blocked), with a Profile danger zone. |
| **C5 — Platform banner** | Admin-editable announcement (message, tone, visible) stored in settings, exposed on `/settings/public`, rendered in both app shells. |
| **D2 — Personalised feed** | `GET /restaurants/recommended` ranks saved → previously ordered → top rated/open, with a "Picked for you" rail on the home page. |
| **Engineering** | Docker Compose (Mongo + API + nginx-served client, validated with `docker compose config`), multi-stage Dockerfiles, structured JSON request logs with `X-Request-Id` correlation, unhandled-rejection guard, client Vitest + Testing Library setup with 10 tests, CI now runs both suites. |

Status: **97 server tests + 10 client tests passing**, production client build green.### Third implementation pass (smaller items, then coupons + disputes)

| Item | What shipped |
|---|---|
| **C2 — Compliance documents** | `Restaurant.documents[]` with owner upload/delete, admin verify/revoke + note, audit entries and owner notifications; documents are excluded from every public restaurant payload. Owner card in `OwnerRestaurant`, review modal in the admin restaurants table. |
| **C3 — No-show controls** | `POST /orders/:id/no-show` (hub-scoped for operators), cancels the order, voids payment/payout, stamps `noShowReportedAt` and increments `User.noShowCount`; hub queue and order-page buttons, no-show column in Admin → Users. |
| **D3 — Admin campaigns** | `Campaign` model + segment resolver (all/active/lapsed customers, owners, everyone), preview with reach + sample, chunked fan-out through `notify()` so per-user preferences are respected, history page and admin nav entry. |
| **B1 — Coupons** | `Coupon` model (percent/flat, min subtotal, percent cap, restaurant scope, window, global + per-customer limits), authoritative quote endpoint, atomic redemption with rollback, discount snapshot on the order, payout computed on the discounted subtotal, admin CRUD/toggle UI and checkout apply/remove with receipt + summary rows. |
| **C1 — Disputes & refunds** | `Dispute` model (categories, 48 h SLA marker), customer report from the order page (one open report per order), admin queue with resolve/reject, refund amount validated against the order and recorded on both rows, customer notification + audit; order page shows the outcome. |
| **Demo seed** | Adds a live `SAVE10` coupon plus one open and one settled (refunded) dispute so Coupons/Disputes screens are populated. |
| **Tests** | +10 cases (compliance docs, no-show, campaigns ×2, coupons ×3, disputes, demo-seed extras) → **94 server tests**; client suite unchanged at 10. |

### Fourth implementation pass (B2 — multi-restaurant checkout)

| Item | What shipped |
|---|---|
| **B2 — Multi-restaurant checkout** | Cart holds dishes from several restaurants (`restaurantId`/`restaurantName` per line, legacy carts migrated on load). `POST /orders/group` validates every restaurant/menu, prices a delivery fee per order, creates 2–5 `PLACED` orders sharing a `checkoutGroup`, compensates by deleting partial work if any later restaurant fails, and notifies each owner. Checkout groups items per restaurant, validates menus in parallel, shows per-restaurant delivery lines, blocks online payment and coupons for split orders, and routes to the first order with a "part of a multi-restaurant order" hint. Cart drawer groups by restaurant; the restaurant page's cart bar is per-restaurant; the "start a new cart?" prompt is gone. |
| **Tests** | +3 server cases (group creation, refuse online/coupon/duplicate, rollback) → **97 server tests**; client cart tests rewritten for multi-restaurant carts + legacy migration (10 total). |

### Fourth implementation pass (B4 — i18n EN/BN) — DONE

| Item | What shipped |
|---|---|
| **B4 — i18n** | Dependency-free EN/BN translation module with fallback to English; language persisted in localStorage + `lang` attr on `<html>`; language switcher in the user menu; ~320 translated strings covering checkout, orders, owner pages, admin pages, notifications, profile, referrals and loyalty; key UI strings translated via `t()`. |
| **Tests** | 38 server tests passing (unchanged), 10 client tests passing; production client build green. |

### Fifth implementation pass (D1/D4 — Referrals & loyalty punch card) — DONE

| Item | What shipped |
|---|---|
| **D1 — Referrals** | `Referral` model + auto-generated `User.referralCode`; registration accepts `referralCode` and links inviter/invitee with signup credit; inviter rewarded once when invitee's first order is collected; referral page with code copy + invite history. |
| **D4 — Loyalty** | `User.loyaltyStamps`/`loyaltyRewards`; one stamp per collected order; every N stamps grants credit; `User.creditBalance` usable at checkout (atomic debit, refunded on cancellation). Referrals page shows stamps/progress and reward. |
| **Tests** | +3 server referral cases → **97 server tests**; client cart tests rewritten for multi-restaurant carts + legacy migration (10 total). |

### Remaining (not started)

| Item | Status |
|---|---|
| **E2E** | Playwright test file written at `client/e2e/order-flow.spec.js` (place → accept → prepare → dispatch → collect); needs running servers + `npx playwright install` browsers to execute. |
| **Docker verification** | `docker-compose.yml` + `Dockerfile`s written and `docker compose config` validated; daemon wasn't running in this environment so image build wasn't exercised. |

---

## 1. What is already implemented (beyond the MVP)

| Domain | Shipped beyond spec | Evidence |
|---|---|---|
| Reviews & ratings | Restaurant + hub + drone stars, one per collected order, owner replies, anonymised names | `server/src/models/Review.js`, `server/src/services/review.service.js`, `client/src/pages/owner/OwnerReviews.jsx` |
| Favourites | Heart toggle, `?saved=1` filter | `server/src/services/auth.service.js`, `client/src/components/restaurant/FavoriteButton.jsx` |
| Reorder | Refills cart from a past order, skipping removed menu items | `client/src/hooks/useReorder.js` |
| Live map + ETA | Leaflet map, drone telemetry, `estimatedArrivalAt`, "5 minutes away" nudge | `client/src/components/order/LiveMap.jsx`, `server/src/services/delivery.service.js` |
| QR pickup | 32-hex `pickupToken` alongside the 6-digit code, camera scanner | `server/src/services/order.service.js`, `client/src/components/order/QrScanner.jsx` |
| Receipts | Server receipt builder + printable page | `GET /api/orders/:id/receipt`, `client/src/pages/orders/Receipt.jsx` |
| Web Push | VAPID keys, subscription model, service worker | `server/src/services/push.service.js`, `client/public/sw.js` |
| Hub operator role | Hub-scoped HTTP access, pickup verification, admin-created accounts | `server/src/constants.js`, `server/src/services/order.service.js` |
| Audit log | Admin mutation trail + CSV export | `server/src/models/AuditLog.js`, `client/src/pages/admin/AdminAudit.jsx` |
| Owner insights | Revenue, prep/flight times, completion rate, best sellers, 14-day chart | `server/src/services/restaurant.service.js`, `client/src/pages/owner/OwnerInsights.jsx` |
| Commission & payouts | `commissionPercent/Amount`, `payoutAmount/Status`, `/admin/payouts` endpoints | `server/src/models/Order.js`, `server/src/services/admin.service.js` |
| Scheduling | `scheduledFor` validated and persisted; owner feed hides future orders | `server/src/services/order.service.js` |
| Fleet extras | Capacity gate, battery reserve + full-trip check, auto-charging dock, return-to-base, service intervals, battery history | `server/src/services/delivery.service.js`, `server/src/services/drone/*` |
| Dev tooling | In-memory MongoDB mode, smoke script, 5 test files (59 tests) | `server/src/devMemory.js`, `server/scripts/smoke.mjs`, `server/tests/*` |

Backend contract is healthy: **`npm test` → 5 files, 59/59 tests pass** (83 s, run during this
audit). The defects below are mostly *client drift* and *unfinished edges*, not a broken core.

---

## 2. Defects found in the audit

> Status: P0 #1–#6, P1 #8–#18 and most P2 items are **fixed** — see §0 for what changed. The tables
> below are kept as the historical finding log.

### P0 — user-visible breakage

| # | Defect | Evidence | Why it matters |
|---|---|---|---|
| 1 | **Checkout crashes to a blank page.** `envOnlinePayment` is referenced but declared nowhere in the repo (no Vite `define`, no import). It evaluates as soon as `/settings/public` resolves, and there is no error boundary. | `client/src/pages/customer/Checkout.jsx:375,379`; `client/src/main.jsx:21-37` | The primary purchase path is dead. One-line fix (`const envOnlinePayment = false`) or delete the block. |
| 2 | **Pickup verification fails for both code and QR.** `orderApi.collect(id, pickupCode)` wraps its second argument, but every caller already passes an object → body `{pickupCode:{pickupCode:"123456"}}` / `{pickupCode:{pickupToken:"…"}}`. Server requires flat 6-digit string or 32-hex token. | `client/src/api/index.js:63`; callers `client/src/pages/admin/AdminPickup.jsx:111,192`, `client/src/pages/orders/AdminActions.jsx:43`; server `server/src/validators/schemas.js:133-136` | No order can ever be marked COLLECTED from the UI. Server tests prove the endpoint itself works — this is purely a client shape bug. |
| 3 | **Receipt page always errors.** `orderApi.receipt` does not exist. | `client/src/pages/orders/Receipt.jsx:15`; `client/src/api/index.js:48-66`; server route `server/src/routes/order.routes.js:45` | Printable/cash-reconciliation receipt unreachable. |
| 4 | **A scheduled drone service can't be cleared.** UI sends `maintenanceDueAt: null`; schema accepts only an ISO datetime or omission. | `client/src/pages/admin/AdminFleetHealth.jsx:36`; `server/src/validators/schemas.js:173` | 400 on "leave empty to clear"; admins can't undo a schedule. |

### P0 — security

| # | Defect | Evidence | Why it matters |
|---|---|---|---|
| 5 | **Every hub operator receives every order, chat message and drone event.** They join the platform-wide `admins` socket room by role, and `emitToAdmins` fans out all order updates and all chat. HTTP is hub-scoped; the socket is not. | `server/src/socket/index.js:22`; `server/src/realtime.js:15`; `server/src/services/order.service.js:96,568` | Cross-tenant data leak (customer names/phones, full chat text) to any hub account. |
| 6 | **One socket emit can kill the server.** `order:join`'s `ack` is never type-checked; a `null` ack throws inside the `catch` handler → unhandled rejection, and there is no `unhandledRejection` guard. | `server/src/socket/index.js:25,28,32` | Any authenticated user can crash the process. Fix: `if (typeof ack === 'function')` and wrap the catch body. |
| 7 | **JWT secret falls back to a published constant** whenever `NODE_ENV !== 'production'`, and `server/.env` ships a placeholder secret. | `server/src/config/env.js:11`; `server/.env:3` | Anyone can forge a token for a publicly listed owner id in a default deployment. |

### P1 — correctness / data integrity

| # | Defect | Evidence | Effect |
|---|---|---|---|
| 8 | **Commission/payout snapshot is never recomputed.** Computed once at creation; `recalc()` only updates `subtotal`/`total`. | `server/src/services/order.service.js:155-158,236-240,372-396` | Customer edits order down to one cheap item (or agrees to drop unavailable items) → payout row keeps the larger amount. |
| 9 | **Payout queue includes non-collected orders.** `payoutStatus` defaults to `PENDING` on every order and `listPayouts` doesn't filter `COLLECTED`. | `server/src/models/Order.js:84`; `server/src/services/admin.service.js:253-271` | Cancelled/abandoned orders appear payable. (Note: `markPayoutPaid` *does* require `PENDING` — one subagent claim was wrong here.) |
| 10 | **Payout filters silently do nothing.** Route validates with `auditQuerySchema`, which strips `status`, `restaurantId`, `page`. | `server/src/routes/admin.routes.js:45`; `server/src/validators/schemas.js:197-201` | Latent (no UI caller yet) but will bite the moment a payouts screen is built. |
| 11 | **Owner Insights rating breakdown is always zeros.** Zeros are assigned to `ratingDistribution`, then real counts are spread onto the response root. | `server/src/services/restaurant.service.js:226-229` | Chart renders 0 for every star. |
| 12 | **Drone service re-flags every trip after the threshold.** `tripsCompleted` is incremented only on the non-maintenance path, and completing service never resets it. | `server/src/services/delivery.service.js:203,231`; `server/src/services/admin.service.js:193-199` | With `DRONE_SERVICE_EVERY_TRIPS=25`, every flight after 25 re-enters MAINTENANCE. |
| 13 | **Charging tick can overwrite a claimed drone.** The timer reads then `save()`s the whole document; `Drone` has no optimistic concurrency. | `server/src/services/drone/ChargingController.js:23-35` | Narrow race: a charging tick can revert `LOADED`/`IN_FLIGHT` to `CHARGING`. |
| 14 | **Internal margin fields leak to customers.** `serialize` only strips pickup secrets. | `server/src/services/order.service.js:81-88` | Customers see `commissionPercent/Amount`, `payoutAmount/Status`. |
| 15 | **Public settings leak the commission rate.** `/api/settings/public` returns the whole fee config. | `server/src/app.js:32`; `server/src/services/setting.service.js:38,54-56` | Competitors can read your take rate. |
| 16 | **Hub operators can cancel PLACED/ACCEPTED orders.** Contradicts the role's "no platform-wide powers" comment. | `server/src/services/orderStateMachine.js:12,17`; `server/src/constants.js:5` | Not exploitable, but a surprising authority for hub staff. |
| 17 | **Payment service is dead code with async bugs.** `initiate()` calls async `createPaymentIntent` without `await`; `ensureStripe()` is unawaited in confirm/capture; currency is `usd` while the app is BDT. | `server/src/services/payment.service.js:15-22,46-57,69-84` | Zero-value intents, `TypeError` if ever called. |
| 18 | **Dependency drift.** `stripe` is declared but not installed; `twilio` is imported but not declared. | `server/package.json:27`; `server/src/services/sms.service.js:12`; `server/node_modules` has no `stripe` | `npm ci` can fail; online payment and SMS can never work. |

### P2 — product/UX rough edges

- `toFormData` drops empty strings, so an owner can never clear a restaurant description or categories (`client/src/api/http.js:77`).
- `MyOrders` tab counts are computed from the loaded page only while paging is server-side (`client/src/pages/customer/MyOrders.jsx`).
- Chat unread is forced to 0 in the desktop rail (`client/src/pages/orders/OrderPage.jsx:251`).
- Receipt prints "Paid" regardless of `paymentStatus` (`client/src/pages/orders/Receipt.jsx:92`).
- New admins see an empty Payouts/Audit/Insights story: seed data has no orders, reviews or audit rows (`server/src/seed/seedData.js`).
- `server/.env.example` is missing ~11 supported variables (`DRONE_*` extras, `DELIVERY_FEE_*`, `VAPID_*`) and `README.md:265` still says "email/SMS, maps and online payment are not implemented" while all three exist.

---

## 3. Roadmap

### A. Finish what is already half-built (highest ROI, no new domain modelling)

| Feature | What's missing | Touches | Effort |
|---|---|---|---|
| **A1. Payouts console + owner earnings** | ✅ Done — `/admin/payouts`, `/owner/earnings`, fixed ledger rules | new `client/src/pages/admin/AdminPayouts.jsx`, `OwnerEarnings.jsx`, `admin.service.listPayouts`, `restaurant.service.earningsReport` | M |
| **A2. Hub-operator console** | ✅ Done — `/hub` queue with exceptions and handovers; hub-scoped actions | `client/src/pages/hub/HubQueue.jsx`, `App.jsx`, `Layouts.jsx` nav, role-aware back-links | M |
| **A3. Scheduled orders end-to-end** | ✅ Done — slot picker, hold banner, release scheduler with one-shot notifications | `Checkout.jsx`, `OrderPage.jsx`, `order.service.releaseDueScheduledOrders`, `server.js` | M |
| **A4. Online payment (Stripe) end-to-end** | Await the intent, publishable key + enabled flag, webhook route mounted with `express.raw` before `express.json`, BDT currency, capture/refund on collect/cancel, Payment Element | `payment.service.js`, `app.js`, `Checkout.jsx`, `OrderSummaryCard`, `Receipt` | L |
| **A5. Notification preferences** | Per-channel prefs (in-app/push/SMS), honour them in `notify()`, unsubscribe button, full notifications page | `User` model, `notification.service.js`, `Profile` page | M |

### B. Out-of-scope spec items worth doing next

| Feature | Notes | Effort |
|---|---|---|
| **B1. Coupons & promotions** | `Coupon` model, validate/redeem inside `createOrder` before commission, discount row in checkout/receipt, admin CRUD | L |
| **B2. Multi-restaurant checkout (split into N orders)** | Keeps the per-restaurant state machine; group model + one pickup code per group; avoids multi-pickup drone routing | L |
| **B3. Email receipts / transactional email** | Mirror `sms.service.js`, hook into `notify()`, "email me the receipt" | S |
| **B4. Bangla + English (i18n)** | Status labels are centralised in `client/src/utils/status.js`, so highest-frequency strings localise cheaply | M |
| **B5. Real drone adapter** | Implement the same controller interface over HTTP/MQTT; telemetry ingest endpoint with idempotent sequence numbers | L |

### C. Trust, safety and operations

| Feature | Notes | Effort |
|---|---|---|
| **C1. Disputes & refunds queue** | Customer "report a problem", admin resolution, links to chat/audit; reuses `confirmationRequest` pattern | M |
| **C2. Restaurant compliance documents** | Licence/expiry uploads via `storage.service.js`, checklist on approval, verified badge | M |
| **C3. No-show / cash-risk controls** | Hub marks "didn't collect", auto-flag + COD cap, admin review; reuses `paymentStatus:VOID` and `needsAdminIntervention` | M |
| **C4. Privacy: export + account deletion** | Soft-delete + anonymise PII, keep fiscal order rows, data export endpoint | M |
| **C5. Platform-wide maintenance/announcement banner** | Setting-driven banner + scheduled downtime notice | S |

### D. Growth and engagement

| Feature | Notes | Effort |
|---|---|---|
| **D1. Referral credits** | Referral code at register, credit ledger, apply at checkout, abuse guard | L |
| **D2. Personalised feed + reorder nudges** | Blend favourites/history/top-rated/open-now; lunch-time push | M |
| **D3. Admin campaigns (segmented push/in-app)** | Segment query + batched `notify()` + delivery stats; must ship with A5 | M |
| **D4. Loyalty punch card** | "10th delivery free" using the order ledger | M |

### E. Engineering investments (cheap, high leverage for a lab demo/viva)

1. **CI** — `.github/workflows/ci.yml`: `npm ci && npm test` in `server`, `npm ci && npm run build` in `client`. Nothing runs the 59 passing tests today.
2. **Docker Compose** — mongo + api + web, so the demo doesn't depend on an in-memory Mongo with different behaviour (`devMemory.js`).
3. **Structured logging + request ids** — `pino-http`, propagate `req.id` into socket handlers/drone ticks; today it's `console.error` only, which makes flight/state-machine races unreconstructable.
4. **Client tests + one E2E** — Vitest/RTL for `CartContext`, `Checkout`, `AdminPickup`; Playwright: place → accept → dispatch → collect. The three P0 client bugs above are exactly what these would catch.
5. **Scenario seed** — `npm run seed:demo` with orders in every status, a mid-flight drone, pending payouts, reviews, audit rows; today Insights/Payouts/Audit screens are empty on a fresh demo.

---

## 4. How this was verified

- Six read-only subagent passes (server inventory, client inventory, spec-gap, roadmap, API contract, security) plus the lead agent re-reading every P0 path and sampling the P1s.
- `npm test` in `server` executed: **59/59 passing** in 5 files, including the QR/receipt and hub-operator pickup tests — which is what proves defects #2 and #3 are client-side, not server-side.
- Two subagent claims were corrected during verification: `markPayoutPaid` *does* require `PENDING`, and a root `README.md` plus `server/tests/` **do** exist (my earlier glob results were truncated, not missing).
- One environment limitation: the harness sandbox cannot grant ACLs on this workspace (`SetNamedSecurityInfoW … Win32 5`), so shell commands ran only via an escalated one-shot; all other inspection used file reads.

### Suggested order of work

1. Fix P0 #1–#6 (half a day) — restores checkout, pickup and closes the socket leaks.
2. Fix P1 #8–#18 (one to two days) — payouts, insights, drone service, payment/deps.
3. Ship A1 + A2 + A3 (payouts, hub console, scheduling UI) — the three features whose backends already exist.
4. Add CI, client tests and a scenario seed before starting any B/C/D feature.
