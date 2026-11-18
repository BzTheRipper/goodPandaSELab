# Project: Drone-Delivery Food Marketplace (MVP – Logic First)

You are a senior full-stack engineer. Build the **functional/logical core** of a Foodpanda-style food marketplace where orders are delivered **by drone to pickup hubs** (not to the customer's door). This is a **Minimum Viable Product**: keep it simple, correct, and easy to extend. Do NOT add features that are not listed below. UI design is **not a priority** in this phase — use plain, clean, minimal styling (basic CSS or a tiny utility setup). A separate design pass will happen later, so keep components cleanly separated from logic to make restyling easy.

## Tech Stack (fixed)
- **Frontend:** React (Vite), React Router, Context or lightweight state (no Redux unless necessary), Axios, socket.io-client
- **Backend:** Node.js, Express.js, MongoDB (Mongoose), Socket.IO
- **Auth:** JWT (access token) + bcrypt password hashing
- **Validation:** zod or Joi on all request bodies
- **Image upload:** multer (store locally in `/uploads` for now, behind a small storage abstraction so it can be swapped for Cloudinary/S3 later)
- Monorepo layout: `/client` and `/server`, each with its own `package.json`, plus a root README with setup/run instructions and `.env.example` files.

## Actors & Roles
1. **Customer** – browses restaurants/menus, orders, chats with restaurant about an order, collects food at a drone hub.
2. **Restaurant Owner** – manages own restaurant + menu, handles incoming orders, loads food onto a drone and dispatches it to a hub.
3. **Admin** – operates the platform (the "Foodpanda authority"): approves restaurants, manages hubs, drones, orders and platform settings.

Use role-based access control middleware on the backend and protected routes on the frontend. Registration is open for Customer and Restaurant Owner; Admin is created via a seed script.

## Core Features

### 1. Restaurant & Menu Management (Owner)
- Owner registers → creates a restaurant profile (name, description, phone, address, logo/cover image, opening status). Restaurant must be **approved by Admin** before it appears publicly.
- CRUD for menu items: name, description, price, category, image, and an `isAvailable` toggle. Owners are expected to list only available items, but can quickly toggle availability off.
- Owner can open/close the restaurant (closed restaurants cannot receive orders).

### 2. Browsing & Ordering (Customer)
- Public pages: restaurant list (with simple search by name/category), restaurant detail with menu.
- Cart (client-side, single restaurant per cart). Checkout requires:
  - **Selecting a drone delivery hub** from the list of active hubs.
  - An optional **order-level note** and an optional **per-item note** (free text). Examples: "less spicy", "0-calorie sugar", "serve hot", "serve cold". Store notes as-is; they are free text, no parsing needed.
  - Payment: for MVP use **Cash on Collection (pay at hub)** only, but isolate payment in a small `paymentMethod` field/service so online payment can be added later.
- Price calculation must be done **server-side** (never trust client prices): subtotal + delivery fee (configurable by Admin) = total.
- Customer can view order history and a live order tracking page.

### 3. Order Lifecycle (state machine — enforce transitions on the server)
Statuses:
`PLACED` → `ACCEPTED` → `PREPARING` → `READY_FOR_DRONE` → `IN_FLIGHT` → `ARRIVED_AT_HUB` → `COLLECTED`
Side branches: `NEEDS_CUSTOMER_CONFIRMATION`, `CANCELLED`, `REJECTED`.

Rules:
- Owner sees new orders in real time (Socket.IO) and can accept or reject (with reason).
- Customer can cancel freely while status is `PLACED`. After `ACCEPTED`, cancellation is only possible through the discussion flow below (or by Admin). Once `READY_FOR_DRONE` or later, the customer cannot cancel.
- Every transition is recorded in an `statusHistory` array (status, timestamp, actor).
- Invalid transitions must return a clear 4xx error.

### 4. Unavailable Item / Unfulfillable Request Flow (important)
- **Item unavailable after order:** the owner can flag the order (or specific items) as unavailable with a message. The order moves to `NEEDS_CUSTOMER_CONFIRMATION`. The owner can then talk to the customer via chat (or by phone — show a `tel:` link with the other party's phone number). Outcome options: the customer **cancels** the order, or **agrees to continue** (e.g., without that item; server recalculates the total). The owner may also cancel the order after the customer agrees to it.
- **Special notes can't be fully met:** same mechanism. Owner clicks "Can't fully satisfy request" with an explanation → order goes to `NEEDS_CUSTOMER_CONFIRMATION`. If the customer **accepts**, the order continues (back to the previous status); if the customer **declines**, they can cancel it.
- Both parties get real-time notifications for this flow.

### 5. Order Chat (Socket.IO)
- One chat room per order, between that order's customer and that restaurant's owner (Admin can read it).
- Persist messages in MongoDB (`Message`: orderId, senderId, text, createdAt). Load history via REST, receive new messages via Socket.IO.
- Authenticate sockets with the JWT. Only participants may join an order's room.
- Chat is only active while the order is not in a final state (`COLLECTED`, `CANCELLED`, `REJECTED`); history remains readable.

### 6. Drone Delivery (restaurant → hub)
- **Hub:** name, address, coordinates (lat/lng), status (active/inactive).
- **Drone:** identifier, status (`IDLE`, `LOADED`, `IN_FLIGHT`, `MAINTENANCE`), current location, battery level, currentOrderId.
- The owner has **limited control**: when the order is `READY_FOR_DRONE`, the owner picks an available `IDLE` drone, confirms the food is attached ("Loaded"), and issues one command: **"Dispatch to hub X"** (the hub the customer chose). The owner cannot control flight path or manual movement.
- **Autonomous routing:** the drone decides its own route. Implement a `DroneService` interface/adapter with a **simulated implementation** for now: compute a route (straight line is fine; code it so a real pathfinding/flight controller can replace it), move the drone's position step by step on a timer, decrease battery, and emit location updates over Socket.IO. When it arrives: drone → `IDLE` (at hub), order → `ARRIVED_AT_HUB`.
- Customer's tracking page shows live status and drone position (a simple text/coordinates or basic map-less display is fine for now).
- **Collection:** upon `ARRIVED_AT_HUB`, generate a 4–6 digit **pickup code** shown to the customer. The order becomes `COLLECTED` when the code is verified (verification done by Admin/hub-operator action or a simple endpoint — keep it simple and document the choice). For cash-on-collection, mark payment as paid at this step.
- Handle basics: if no drone is available, show that to the owner; if a drone fails (Admin can mark it failed), the order should be flaggable for Admin intervention.

### 7. Admin Panel
- Dashboard: counts of orders by status, active drones, pending restaurant approvals.
- Manage restaurants: approve / suspend / reactivate.
- Manage users: list, deactivate/activate.
- Manage hubs: CRUD.
- Manage drones: CRUD, view fleet status/battery/location, set maintenance, mark failed.
- Orders: list/filter by status, view details + status history + chat, force-cancel with reason.
- Platform settings: delivery fee (and nothing else for now).

### 8. Minimal "Must-Have" Extras (include only these)
- Registration/login/logout, password hashing, JWT auth, basic profile (name, phone, address).
- Phone number required for all users (needed for calls).
- Real-time notifications for key events (new order, status change, confirmation requested, new chat message) via Socket.IO + a simple in-app notification list/badge.
- Input validation, centralized error handling, consistent JSON error format, basic rate limiting on auth routes, CORS and Helmet.
- Seed script: 1 admin, 2 restaurant owners with approved restaurants and menu items, 3 hubs, 4 drones, 1 customer.
- Basic automated tests for the order state machine and role-based authorization (Jest/Vitest + supertest).

## Explicitly OUT OF SCOPE (do not build now)
Online payment gateways, coupons/promotions, ratings & reviews, delivery to customer's door, multiple-restaurant carts, real map integration, email/SMS notifications, multi-language, restaurant analytics/reports, commission/payout systems, real drone hardware integration, refresh tokens/OAuth/social login, PWA/mobile apps.

## Suggested Data Models (Mongoose)
User, Restaurant, MenuItem, Order (items snapshot with name/price/note, subtotal, deliveryFee, total, hubId, droneId, status, statusHistory, pickupCode, paymentMethod, paymentStatus, customerNote, confirmationRequest {message, requestedAt, resolution}), Hub, Drone, Message, Notification, Setting.
Snapshot item name/price into the order at placement time.

## Engineering Guidelines
- Clean structure on the server: `routes → controllers → services → models`, with business rules (especially the order state machine and drone logic) in services so they are unit-testable.
- Use environment variables for all config; never hardcode secrets.
- Keep frontend components small; separate **logic (hooks/services/API layer)** from **presentation**, so the later design phase only touches presentation.
- Use Mongo transactions or atomic updates where a race is possible (e.g., two owners assigning the same drone).
- Write concise, readable code with brief comments only where intent isn't obvious.

## Delivery Plan
Work in phases and make sure each phase runs before moving on:
1. Project setup, auth, roles, seed script.
2. Restaurant, menu, admin approval.
3. Cart, checkout, order creation, order state machine.
4. Socket.IO: notifications + order chat.
5. Unavailable-item / unmet-request confirmation flow.
6. Hubs, drones, simulated drone dispatch and tracking, pickup code & collection.
7. Admin panel pages.
8. Tests, README, final cleanup.

At the end, provide: how to run everything locally, the seeded credentials, a short list of API endpoints, and any assumptions you made. If something in this spec is ambiguous, choose the simplest reasonable option, note it in the README, and continue.
