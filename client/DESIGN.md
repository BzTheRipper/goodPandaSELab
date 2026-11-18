# GoodPanda — Design system & redesign plan

Scope: look, feel and UX of the React client only. Business logic, API routes, request/response
shapes, DB models, the order state machine and socket event names are out of bounds.

## 1. Direction

- **Clean, minimal, modern.** Generous whitespace, soft rounded corners (8–20px), subtle layered
  shadows, white surfaces on a faint green-gray page (`--color-bg`). Food photography is the hero;
  chrome stays quiet.
- **Light green brand.** `#4ADE80` / `#86EFAC` for accents and primary buttons, `#16A34A` for
  focus rings, borders and hover, `#F0FDF4` / `#DCFCE7` for tints. Neutral grays and semantic colors
  (success / warning / danger / info) for everything else.
- **Inter only**, self-hosted (variable weight).
- **Less on-screen text.** Explanations live in `InfoTooltip` (i) buttons — keyboard focusable,
  tap to toggle, Esc to close. Tooltips are never the only place for an error, a required field or a
  required action; those always render inline.
- **English UI, BDT money** via `money()` → `৳1,250.00`.
- **Mobile-first from 320px.** Breakpoints 640 / 768 / 1024 / 1280.

## 2. Tokens

Single file: **`client/src/styles/tokens.css`** (CSS custom properties on `:root`).

| Group | Tokens |
|---|---|
| Primitives | `--green-50…950`, `--gray-0…900`, red/amber/blue/violet scales |
| Semantic color | `--color-bg`, `--color-surface(-muted/-brand)`, `--color-text(-muted/-subtle)`, `--color-border(-strong)`, `--color-primary(-hover/-active/-soft)`, `--color-on-primary`, `--color-link(-hover)`, `--color-focus`, `--color-focus-strong`, `--color-{success,warning,danger,info}(-bg/-border)` |
| Type | `--font-sans`, `--text-xs…3xl`, `--weight-*`, `--leading-*` |
| Space / shape | `--space-0…16` (4px grid), `--radius-sm/md/lg/xl/full`, `--shadow-xs/sm/md/lg`, `--ring` |
| Layout | `--container` 1200, `--header-height` 64, `--sidebar-width` 248, `--control-height` 44 / `-sm` 44 (44px minimum touch targets) |
| Motion | `--duration-fast`, `--duration`, `--ease` (neutralised under `prefers-reduced-motion`) |
| Layers | sticky 100 · dropdown 200 · drawer 300 · modal 400 · toast 500 · tooltip 600 |

`base.css` holds the reset, element defaults, `:focus-visible` ring, `.visually-hidden` and the
reduced-motion rule. Components use **CSS Modules** exclusively; no utility framework.

### Contrast (WCAG AA)

| Pair | Ratio | Use |
|---|---|---|
| `#052E16` on `#4ADE80` | ≈ 9 : 1 | primary button text (never white on light green) |
| `#15803D` on white | 5.0 : 1 | links, brand text |
| `#15803D` on white | 5.0 : 1 | solid focus ring (`--color-focus-strong`, ≥ 3 : 1 non-text even on green tints) |
| `#16A34A` on white | 3.3 : 1 | borders, icons only (non-text, ≥ 3 : 1) |
| white on `#DC2626` | 4.8 : 1 | solid danger button |
| `--color-text-muted` (`#525B56`) on white | ≈ 7 : 1 | secondary text |
| `--color-text-subtle` (`#626C66`) on `--color-surface-muted` (`#F1F4F2`) | ≈ 4.5 : 1 | subtle text on tinted surfaces |

## 3. Dependencies

- **`@fontsource-variable/inter`** — the only new dependency. Self-hosting Inter avoids a
  third-party font request (privacy, offline dev, no layout shift from a slow CDN).
- Icons are hand-written inline SVG (`ui/Icon.jsx`), so no icon library.
- Tooling used during design QA (sharp, puppeteer-core) lived in a temp folder and is **not** part
  of the project.

## 4. Status mapping

One source of truth: **`client/src/utils/status.js`**.

- `ORDER_STATUS`, `DRONE_STATUS`, `RESTAURANT_STATUS` and `PAYMENT_STATUS` map each value to
  `{ label, tone, icon, hint }`. `hint` is the InfoTooltip text, shown with
  `<StatusPill showHint />`.
- `statusMeta(kind, status)` looks up an entry. `FINAL_ORDER_STATUSES` and `isFinalOrder()` are
  exported from the same file.
- `ORDER_FLOW` is the seven-step happy path used by the order timeline; `isAttentionOrder()`
  flags the two statuses that need a customer's eyes (`NEEDS_CUSTOMER_CONFIRMATION`, `ARRIVED_AT_HUB`).
- `StatusPill kind="order" status={…}` renders it. All pages, admin filters and dashboard labels
  read from this file.

## 5. Component library — `client/src/components/ui/`

Import everything from `components/ui/index.js`. Components are presentational; data loading stays
in hooks (`useAsync`, `useAction`, `useOrder`, contexts).

| Component | API (main props) |
|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger\|dangerGhost`, `size: sm\|md\|lg`, `icon`, `iconRight`, `iconOnly`, `loading`, `block`, `to` (renders a Link) |
| `Field` | `label`, `hint` (tooltip), `optional`, `error`; wires `id` / `aria-describedby` |
| `Input`, `PasswordInput`, `Textarea`, `Select` | native props + `icon`; `PasswordInput` has a show/hide toggle |
| `Checkbox`, `Toggle` | `label`, `checked`, `onChange` (Toggle is `role="switch"`) |
| `Card`, `CardHeader` | `as`, `to`, `padding: md\|sm\|none`; header `title`, `hint`, `actions` |
| `Badge`, `StatusPill`, `CountBadge` | `tone`, `dot`; `kind` + `status`; `count`, `max` |
| `Modal`, `Drawer` | native `<dialog>`; `open`, `onClose`, `title`, `description`, `footer`, `size`; Drawer `side: left\|right`, `size: sm\|md`, sticky `footer`. Focus trap, Esc, backdrop close, scroll lock; Modal is a bottom sheet on mobile |
| `ConfirmDialog`, `useConfirm()` | `await confirm({ title, message, confirmLabel, tone })` → `boolean` |
| `Tabs` | `tabs: [{value,label,count}]`, `value`, `onChange`, `variant: underline\|pills`; arrow/Home/End keys |
| `Table` | `columns: [{key, header, render, align, primary, hideOnMobile}]`, `rows`, `rowKey`, `rowTo`, `empty`; stacks into cards below 768px |
| `useToast()` | `success / error / info / warning(message)`; polite live region, max 4 |
| `Skeleton` | `variant: text\|rect\|circle`, `width`, `height`, `lines` |
| `Spinner`, `PageLoader` | inline and full-area loading |
| `Alert`, `FormError` | `tone`, `title`, `action`; danger uses `role="alert"` |
| `EmptyState`, `ErrorState` | `icon`, `title`, `action`; ErrorState `error`, `onRetry` |
| `Avatar` | `name` → initials on a hashed pastel, `src`, `size`, `square` |
| `InfoTooltip` | `content`, `label`, `size`; portals into the open `<dialog>` when inside one |
| `PhoneLink` | `tel:` link with a labelled phone icon |
| `Media` | `src`, `alt`, `ratio` (default `16 / 9`, or set `--media-ratio` from CSS), `icon`, `eager`. Fixed aspect-ratio box, `loading="lazy"` + `decoding="async"`, green placeholder when there's no image or it fails |
| `Chip` | pill button; `selected`, `icon`; `toggle` (default) adds `aria-pressed`, `toggle={false}` for nav chips (use `aria-current`) |
| `QuantityStepper` | `value`, `onChange`, `min`, `max` (50), `label`, `size: md\|sm`. `role="group"`; at 1 the minus becomes a remove (trash) button; ref points at "+" |

Layout pieces live in `components/layout/`:

- `PublicLayout`, `DashboardLayout`, `RoleLayout`, `AuthLayout`;
- `Logo`, `NotificationBell`, `UserMenu`, `PageHeader`.

Cart pieces live in `components/cart/`: `CartDrawer` (right `Drawer`, opened from the header cart
button or the restaurant "View cart" bar, closes on navigation) and `CartLine` (thumbnail, name,
unit price, line total, stepper; `unavailable` swaps the stepper for Remove; `children` slot for
the item note).

Order pieces live in `components/order/`:

- `OrderJourney` + `OrderTimeline`: the plain-language status hero and the seven-step journey.
  Timestamps come from `statusHistory`; desktop is horizontal, below 768px it turns vertical.
  Cancelled / rejected orders stop at the step they reached and end in a red terminal node;
  `NEEDS_CUSTOMER_CONFIRMATION` pauses at the previous step.
- `DroneFlightPanel`: drone identity, battery and a map-less restaurant → hub progress line driven
  by the existing `drone:location` telemetry (no map library).
- `PickupCodeCard`: the large, copyable pickup code, hub name/address, cash amount and the
  collected state. The API only serializes `pickupCode` for the customer, so this card is customer-only.
- `ConfirmationBanner`: the highlighted decision for unavailable items or an unmet note, with
  Continue (recalculated total), Cancel (confirm dialog), Call restaurant and Chat shortcuts.
- `OrderSummaryCard`: compact `<details>` receipt with items, notes, fee, payment and hub.
- `OrderChat`: messenger bubbles, day separators, optimistic sends, auto-scroll, jump-to-new and a
  read-only closed state. The page reuses it in the desktop rail (≥1200px) and a mobile `Drawer`.

Hooks:

- `usePageTitle`, `useDismiss`;
- `useChatUnread`: counts only messages that arrive while the chat is closed; history loaded on
  page open is treated as read;
- `useMediaQuery`: chooses the desktop chat rail vs the mobile drawer;
- `useAddToCart()` → `async (restaurant, item) => boolean`. Enforces the single-restaurant cart with a
  "Start a new cart?" `useConfirm` dialog;
- `useScrollSpy(ids)` → `[activeId, scrollTo]`. Drives the sticky category nav and focuses the
  section heading after scrolling.

`CartContext` also exposes `drawerOpen / openCart / closeCart`, `quantityOf(id)` and
`conflictsWith(restaurantId)`. Quantities are clamped to the API limit of 50.

The shell publishes the measured header height as `--header-offset` on `<html>`. Sticky elements
(category nav, checkout summary) and `scroll-padding-top` use it, so focused or scrolled-to content
never hides under the header. Route changes scroll to the top, except back/forward.

### Error messages

`errorMessage(err)` in `api/http.js` maps the backend shape `{ error: { message, code, details } }`
to friendly text, and every `useAsync` / `useAction` uses it:

- network failure → "Can't reach GoodPanda…";
- `INTERNAL` / 5xx → a generic retry message;
- `RESTAURANT_CLOSED` and `CONCURRENT_UPDATE` → plain-language rewrites;
- validation `details` → "Please check the {field names}…", using readable field names;
- unknown route `NOT_FOUND` and malformed ids → "isn't available any more" / broken-link text;
- anything else → the server's own message, which is already user-facing.

`errorCode(err)` returns the code for branching (e.g. reload the menu after `ITEM_UNAVAILABLE`).
Toasts are used for the result of an action (order placed, cart replaced); inline `Alert`s or field
errors stay on screen for anything the user must fix.

## 6. App shell

- **Public / customer.** Sticky header containing:
  - the logo;
  - search, which writes `/?q=` (inline on desktop, its own row on mobile; hidden on `/`, where the hero search replaces it);
  - Restaurants and My orders links (≥ 1024px);
  - a cart button with a count badge that opens the cart drawer (guests and customers);
  - the notification bell;
  - the user menu, or Log in / Sign up for guests. Log in is hidden below 360px; it stays reachable from Sign up.

  Plus a skip link and a footer.
- **Owner / admin.** Left sidebar at ≥ 1024px. Below that, a hamburger opens a `Drawer`, which
  closes on navigation. The top bar holds the bell and the user menu.
- **Auth.** Split screen with a food hero image at ≥ 1024px (`assets/auth-hero.webp`, AI-generated,
  223 KB); form only on mobile.
- **Notification bell.** Unread count badge and a panel with "Mark all read". Unread rows are
  tinted with a dot; each row shows relative time and links to its order.
- **Routing.**
  - Every page is `React.lazy` with a `PageLoader` fallback.
  - `Page` sets `"<title> · GoodPanda"` and applies the role guard.
  - A friendly 404 page and an access-denied state.

## 7. Page inventory & UI states

✅ = redesigned in this phase. ◻ = still on the legacy scope (§8).

| Route | Page | Roles | States to design |
|---|---|---|---|
| `/login` ✅ | Login | guest | idle, submitting, wrong credentials, dev demo accounts |
| `/register` ✅ | Register | guest | role picker, field validation, submitting, server error (email taken) |
| `/profile` ✅ | Profile | any | pristine (save disabled), dirty, saving, saved toast, error |
| `*` ✅ | NotFound | any | role-aware home action |
| — ✅ | Access denied | any | wrong role for route |
| `/` ✅ | RestaurantList | all | hero search, category chips (`?category=`), skeletons, results count, no results, error + retry, closed (greyed cover + badge) |
| `/restaurants/:id` ✅ | RestaurantDetail | all | skeleton, cover + logo header, about tooltip, sticky category nav, Add → stepper, unavailable item, closed (alert + disabled Add), owner/admin view-only, empty menu, not found, "View cart" bar |
| — ✅ | Cart drawer | guest/customer | empty, lines with steppers, clear-cart confirm, subtotal + fee tooltip, "Go to checkout" |
| `/checkout` ✅ | Checkout | guest/customer | empty cart, item notes ("Add note"), order note + quick chips + counter, hub cards (loading/error/none/required error), summary, cash-on-collection tooltip, closed / unavailable item / restaurant gone / non-customer blockers, guest → login, placing, error toast + inline |
| `/orders` ✅ | MyOrders | customer | loading skeletons, empty history, empty tab/status, active / past / all tabs, status filter, attention and ready-to-collect cues, live status toasts, error + retry |
| `/orders/:id` ✅ | OrderPage | customer/owner/admin | status hero + timeline (horizontal/vertical), confirmation banner (partial availability), drone panel (live progress), pickup code (copy, address, cash), collected, cancelled/rejected (reason), collapsible summary, desktop chat rail / mobile drawer, role actions, intervention, loading skeleton, error + retry, live status toast/flash |
| `/owner/orders` ✅ | OwnerOrders | owner | live grouped board (New / In progress / Waiting / Ready–Drone / Completed), new-order highlight + toast, status-valid card actions, customer-note cue, loading skeletons, empty, error + retry |
| `/owner/menu` ✅ | OwnerMenu | owner | card grid, category filter, add/edit modal with live image preview, instant availability toggle + toast, delete confirm, loading skeletons, empty, error + retry |
| `/owner` ✅ | OwnerRestaurant | owner | create (first run), pending/approved/suspended states with next steps, open/closed switch + tooltip, logo/cover upload previews, details form, loading, error + retry |
| `/admin` ✅ | AdminDashboard | admin | stat cards, orders-by-status shortcuts, fleet summary, recent orders, loading/empty/error |
| `/admin/orders` ✅ | AdminOrders | admin | search, status/intervention filters, responsive table, empty/error, live updates |
| `/admin/pickup` ✅ | AdminPickup | admin | order picker, large code input, confirm, success/error feedback, collected/paid result |
| `/admin/restaurants` ✅ | AdminRestaurants | admin | search/status filters, approval badges, approve/suspend/reactivate confirms |
| `/admin/users` ✅ | AdminUsers | admin | search/role/status filters, role badges, activate/deactivate confirms, self protection |
| `/admin/hubs` ✅ | AdminHubs | admin | responsive table, create/edit modal, active state, deactivate/delete confirms |
| `/admin/drones` ✅ | AdminDrones | admin | card grid, status pill, battery meter, location/order, edit modal, failed/maintenance/recharge/delete confirms |
| `/admin/settings` ✅ | AdminSettings | admin | validated delivery fee form, saved/error states |

## 8. Legacy scope (removed)

All pages use design-system components and CSS Modules. The temporary `.legacy` wrapper,
`legacy: true` route flags and `styles/legacy.css` have been removed. The old `window.confirm`
calls in AdminFleet were replaced with `useConfirm()`; every destructive admin action now uses
`ConfirmDialog`.

## 9. Plan for later steps

1. **Customer browsing & checkout** — done (see §7 and §10).
2. **Order tracking, chat & notifications** — done (see §7 and §10).
   - Timeline, drone progress, pickup code, confirmation prompt, summary and messenger-style chat.
   - My Orders tabs/filters, attention cues and live toasts.
   - Owner actions, drone loading/dispatch and the admin pickup-code tool share the same components.
3. **Owner screens** — done (see §7 and §11).
   - **Orders board:** grouped, live-updating sections with highlighted new arrivals and compact, status-valid card actions.
   - **Order detail:** owner ticket + timeline + order actions (confirmation requests, drone dispatch, call/chat) on the shared `/orders/:id` page.
   - **Menu manager:** responsive card grid with category filter, edit `Modal` + live image preview, instant availability `Toggle` and delete confirmation.
   - **Restaurant profile:** approval-state banners with next steps, logo/cover previews, editable details and an open/closed `Toggle`.
4. **Admin screens** — done (see §7 and §12).
   - **Dashboard:** stat cards with icons, status chips that link to filtered orders, a fleet panel and recent orders.
   - **Lists:** responsive `Table`s with filters for orders, restaurants, users and hubs; drones use a card grid.
   - **Pickup:** a focused verification screen with a large code input and inline success/error feedback.
   - **Confirmations:** `ConfirmDialog` for every destructive or state-changing action.
   - **Settings:** a validated form card.
5. **Polish**
   - `legacy.css` removed.
   - Consistent skeletons and empty/error states on every page.
   - Motion pass, respecting reduced motion.
   - Favicon and social meta.
   - Audit with axe/Lighthouse (contrast, landmarks, focus order) and a 320px sweep.
   - Move remaining legacy images to `Media` (lazy, fixed aspect ratio).

## 10. Customer flow notes & known limitations

- **Cart page replaced.** `/cart` is gone: the cart is a drawer reachable from every shopper page,
  and `/checkout` is the full page. Login returns guests to `/checkout` (`state.from`).
- **Single-restaurant cart.** Adding from another restaurant asks "Start a new cart?" (Keep my cart /
  Start new cart). Nothing is removed without confirmation.
- **Live checks at checkout.** Checkout re-fetches the restaurant: live prices are shown, items no
  longer on the menu are marked "No longer available" with Remove, and a closed or deleted restaurant
  blocks Place order with an explanation. After `ITEM_UNAVAILABLE` / `RESTAURANT_CLOSED` /
  `NOT_FOUND` the menu is reloaded; after a hub error the hubs are reloaded.
- **Quick notes.** The chips ("Less spicy", "Serve hot", "Serve cold", "0-calorie sugar") toggle a
  comma-separated phrase in the free-text order note. They are not a separate field, so the API
  payload is unchanged.
- **Delivery fee is not public.** The fee lives in admin settings (`GET /api/admin/settings`) only,
  so checkout shows "Delivery fee: Added at order" and the total as "৳X + fee". The real fee
  appears on the order page. Recommended backend follow-up: a public read-only endpoint (e.g.
  `GET /api/settings/public` → `{ deliveryFee }`).
- **Unavailable dishes.** The public menu endpoint only returns available items, so the disabled
  "Unavailable" food-card state only shows if the API ever includes them; stale cart items are
  caught at checkout instead.
- **Order page layout.** From 1200px the chat is a sticky rail; below that the same `OrderChat`
  opens in a right `Drawer` (with an unread badge in the page header). The timeline is horizontal
  from 768px and vertical on phones. Status changes flash the journey card and toast only when the
  update came from the other party — local actions show their own result toast. Reduced-motion
  users get no flash or bubble animation.
- **Pickup codes.** Only the customer's order payload includes `pickupCode`, so the owner and admin
  never see it on the shared page. The admin collects with the hub-operator form, which verifies
  the code before marking the order paid.
- **Chat unread.** Messages loaded with the page are treated as read; the badge counts messages
  that arrive while the chat rail/drawer is closed. The server still owns chat closure for final
  orders and admin read-only access.

## 11. Owner flow notes & known limitations

- **No backend changes.** All owner screens use the existing `/api/owner`, `/api/orders` and
  `/api/drones/available` contracts and the existing socket events. The board listens to the same
  `useOrderList()` live merge as customer orders; local action results are overlaid until the next
  socket update arrives.
- **Grouped, not tabbed.** Sections render only when non-empty and reorder as statuses change. A
  short-lived pulse + toast marks orders that arrive while the page is open; already-placed new
  orders keep the stronger green “New” card treatment.
- **Owner order detail stays on `/orders/:id`.** The shared page swaps the customer receipt for an
  owner ticket (`OwnerOrderBrief`) and owner-only actions; the pickup code remains customer-only.
- **Actions mirror the state machine.** Only valid transitions render: accept/reject on New,
  preparing/confirmation requests while cooking, load/dispatch when ready, and call/chat whenever a
  customer is available. Cancellation is offered only where the server allows it.
- **Drone suitability is advisory.** `/drones/available` is the source of truth for which drones can
  be listed (IDLE, unassigned, ≥20% battery). The client additionally estimates the charge needed for
  this restaurant → hub route to explain disabled choices in an `InfoTooltip`; the server re-checks
  the same minimum when the food is loaded.
- **Image previews are local.** Files are previewed with object URLs and only uploaded on Save (menu
  modal / profile save). Availability toggles and the open/closed switch save immediately with a
  toast; both revert on-screen if the server rejects the change.
- **Approval states.** Pending and suspended banners explain what the owner can still do and the next
  step. The open/closed switch is disabled while suspended because only an admin can reinstate the
  restaurant. No PENDING/SUSPENDED restaurant is seeded, so these states are reachable through normal
  registration/admin actions rather than the demo accounts.

## 12. Admin flow notes & known limitations

- **No backend changes.** Admin screens use the existing `/api/admin`, `/api/orders` and socket
  contracts. Role and active-status filters for users and search for restaurants/orders are applied
  client-side because those endpoints only accept a single server-side filter.
- **Shared order detail.** `/orders/:id` stays the single order detail for every role. The admin view
  reuses its timeline/history, read-only chat, force-cancel form, flight recovery and hub handover;
  `/admin/orders` links into it and offers a shortcut to the focused pickup screen.
- **Pickup verification.** `/admin/pickup` lists orders at a hub (or accepts `?order=` from the orders
  table) and calls the existing `POST /api/orders/:id/collect` with the 4–6 digit code the customer
  reads from their own order page. Codes are never exposed to admins.
- **Fleet actions.** Marking a failed drone uses `POST /api/drones/:id/fail`; mid-flight failures flag
  the order with `needsAdminIntervention`. The shared order page then offers recovery to
  `READY_FOR_DRONE` or a force-cancel with a reason. Maintenance and recharge use the existing drone
  update fields; location/status are locked in the editor while a drone is assigned.
- **Destructive actions.** Hub and drone deletion, deactivation, suspension, deactivation of users,
  marking drones failed and status changes all use `ConfirmDialog`. Deletion is only offered when the
  API allows it (unassigned drones; hubs without active orders), with the rule shown in a tooltip.
- **Seed data.** No orders are seeded, so dashboard metrics, order lists and pickup verification start
  empty until a test order is placed. All seeded restaurants are approved/open; pending and suspended
  states require an admin action or a new owner registration.

## 13. Final design QA pass

A final whole-client pass audited visual consistency, dead code, accessibility, clutter/state
handling and responsive behavior, then applied the fixes below. No backend, API, socket, DB, model
or order state-machine code changed. The design-system components, CSS Modules and `tokens.css`
remain the single source of theme values.

**Consistency & dead code**
- Removed the orphaned `components/OrderTable.jsx` (referenced removed global classes, raw
  non-responsive table).
- Deleted unused CSS (`.help`, `.rowEnd`, `.modalNote`, `.estimate`, pickup intro/footnote,
  `uploadText p`, `.error`) and fixed an invalid token (`--color-green-950` → `--green-950`).
- Restaurant approval, owner drone status, payment method and chat sender roles now all use the
  shared `status.js` mapping / friendly labels instead of raw enums.
- Toolbar heights and font sizes that bypassed tokens were retied to `--control-height` and
  `--text-*`.

**Accessibility**
- Focus is now clearly visible everywhere: `--ring` is a white separation ring plus a solid
  `--color-focus-strong` (`#15803D`, ≥ 3:1) ring, and `--color-focus-strong` is used by the global
  `:focus-visible` outline. Subtle text (`--gray-500`) was darkened to `#626C66` so it passes AA
  on tinted surfaces.
- 404 and access-denied states render a real `<h1>` (`EmptyState titleAs`); all `<main>` shells are
  focusable (`tabIndex={-1}`) so skip links land correctly.
- Toasts pause their auto-dismiss while hovered or focused; durations raised to 5s/8s. Notification
  mark-read errors surface as toasts instead of being swallowed, and the popover no longer injects a
  stray `<h2>` into the heading outline.
- Checkout hub radios expose `aria-invalid`; the category nav smooth-scroll respects
  `prefers-reduced-motion`.

**Clutter & states**
- Default-visible explanations in order actions, drone panels, confirmation requests and admin
  pickup moved into `InfoTooltip`; errors, required fields and required actions stay inline.
- Dashboard/pickup load errors now use `ErrorState` with retry; the dashboard empty recent-orders
  list uses a compact `EmptyState` and never shows fake `0` stats while loading. Checkout's live
  menu re-check shows a spinner and `aria-busy`.

**Responsive & performance**
- All pages are route-level lazy chunks (largest route ≈ 19 kB gzip; main bundle ≈ 109 kB gzip).
  A scripted sweep of **90 route/viewport combinations** (guest, customer, owner and admin routes at
  320 / 375 / 768 / 1024 / 1440px) found **0 horizontal overflow and 0 console errors**.
- Interactive controls were raised to a 44px touch target (buttons, chips, tabs, steppers, form
  reveal, call links, popover/menu rows, logo links, dashboard status/recent-order links); tooltip
  and status-hint buttons keep their small visual size but use a transparent 44px hit area. The
  pickup code wraps and shrinks at 320px, the auth role picker collapses to one column, and the
  mobile notification panel uses `--header-offset`.

**Verification** (final, after all edits): `npm test` in `server` (2 files, 23/23 pass), `npm run
smoke` (full order lifecycle), `npm run build` in `client` (241 modules, built successfully — main
JS 325.76 kB / 109.25 kB gzip, main CSS 41.39 kB / 8.74 kB gzip, largest route `OrderPage` 60.15 kB /
18.92 kB gzip), plus the 90-combo responsive sweep above (0 overflow, 0 console errors).

**Remaining known limitations**
- Timestamp tooltips on `<time>` elements still use the native `title` attribute rather than
  `InfoTooltip`; they are hover-only, not keyboard/tap accessible.
- A few decorative values (avatar palette, logo SVG fills, the select-arrow SVG, and some
  translucent glows) remain hardcoded rather than tokenized; they are purely decorative and do not
  affect layout or contrast.
- Search / user-status filters are client-side where the endpoints accept only one server filter.
