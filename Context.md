# DrobeBook — App Context

Shopify embedded app for **GK.Drobe** gown hire, try-on appointments, and date-based storefront search.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router v7 (file-based routes) |
| Shopify | `@shopify/shopify-app-react-router`, App Bridge, Polaris web components |
| Database | PostgreSQL + Prisma |
| Hosting | Railway (production), Shopify CLI tunnel (dev) |
| Email | Resend (optional; logs to console without API key) |
| Theme extension | `extensions/gk-drobe-booking` (Liquid blocks + JS/CSS assets) |

## Repo layout

```
app/
  routes/           Admin UI + app proxy API + webhooks
  components/       Shared admin UI (modals, previews, calendar)
  lib/              Business logic (booking, rental, search, notifications, etc.)
  shopify.server.ts Shopify auth + session storage
extensions/
  gk-drobe-booking/ Theme app extension (storefront widgets)
prisma/             Schema + migrations (PostgreSQL)
shopify.app.toml    Dev Shopify config (CLI updates URLs)
shopify.app.production.toml  Production URLs (Railway)
railway.toml        Railway deploy config
Dockerfile          Multi-stage production build
```

## Core features

### 1. Gown hire (booking widget)
- Product-page widget: size, duration, colour, delivery method, calendar
- Availability API + cart behaviour
- Admin: buffer settings, blocked dates, rental calendar

### 2. Try-on appointments
- Storefront try-on widget with slot selection (50/30/20 min rooms)
- Overlapping room occupancy synced across durations
- Admin calendar + manual booking modal
- Try-on credits / discount codes after appointment

### 3. Search by date
- Storefront search toolbar (event date, size, duration, delivery, dates)
- Dynamic size/colour facets from rental products
- Results page with unified filter panel

### 4. Rentals admin
- Import/configure Shopify products as rental products
- Rental workflow: reserved → confirmed → packed → dispatched → returned
- Customer picker, Shopify order sync, tracking links

### 5. Inventory & bookings
- Garment inventory, stats, per-product detail
- Rental calendar view
- Waitlist with claim tokens

### 6. Email notifications (Resend)
- Templates: rental created, dispatched, cancelled, return reminder, after-rental, waitlist, try-on confirmed
- Token-based subject/body (`{{customerFirstName}}`, `{{rentalStartDate}}`, etc.)
- Scheduled notifications on admin page load / manual run

## Database models (Prisma)

- `Session` — Shopify OAuth sessions
- `Garment` — inventory stats per variant
- `Booking` — rental bookings
- `AppointmentSlot` / `AppointmentBooking` / `AppointmentHold` — try-on scheduling
- `TryOnCredit` — post-try-on discount codes
- `NotificationSend` — deduplicated email log
- `WaitlistEntry` — waitlist + claim flow
- `BlockedDate` — product/store date blocks
- `ShopSettings` — JSON config per shop
- `RentalProduct` / `RentalProductVariant` — imported Shopify catalog for rentals

## Key routes

### Admin (`/app/*`)
| Route | Purpose |
|-------|---------|
| `/app` | Dashboard |
| `/app/products` | Import & manage rental products |
| `/app/products/configure` | Per-product rental config |
| `/app/rentals` | Rental list + create |
| `/app/rentals/:id` | Rental detail + manual emails |
| `/app/bookings` | Rental calendar |
| `/app/inventory` | Garment inventory |
| `/app/waitlist` | Waitlist management |
| `/app/settings` | Storefront widget settings |
| `/app/settings/notifications` | Email templates |
| `/app/appointment-calendar` | Try-on calendar |
| `/app/buffer-settings` | Hire buffer rules |
| `/app/blocked-dates` | Blocked date ranges |

### Storefront app proxy (`/apps/gk-drobe/*`)
Proxied from `{store}.myshopify.com/apps/gk-drobe/...`

- `availability`, `availability-calendar` — booking dates
- `appointment-slots`, `appointment-reserve`, `appointment-config`, `appointment-calendar`
- `search-by-date`, `search-config` — date search
- `waitlist`, `waitlist-claim`
- `config` — widget config JSON
- `product-rental-status`

### Webhooks
- `app/uninstalled`, `app/scopes_update`
- `orders/create`, `orders/cancelled`, `refunds/create`

### Health
- `GET /health` — Railway uptime check (`{"ok":true,"service":"drobebook"}`)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SHOPIFY_API_KEY` | Yes | App client ID |
| `SHOPIFY_API_SECRET` | Yes | App client secret |
| `SHOPIFY_APP_URL` | Yes | Public app URL (no trailing slash) |
| `SCOPES` | Yes | Comma-separated OAuth scopes |
| `NODE_ENV` | Prod | `production` on Railway |
| `PORT` | Prod | `3000` |
| `RESEND_API_KEY` | No | Resend API key for real emails |
| `NOTIFICATION_FROM_EMAIL` | No | Verified sender domain |

## Local development

```bash
# Option A: Docker Postgres
docker compose up -d
# Set DATABASE_URL in .env (see .env.example)

npx prisma migrate deploy
npm run dev
```

```bash
# Option B: Temporary Prisma Postgres (expires ~24h)
npx create-db@latest --region us-east-1 --env .env
npx prisma migrate deploy
npm run dev
```

Open app via Shopify CLI preview URL or Partners → Install app on dev store.

## Production (Railway)

1. Deploy from GitHub (`devcarnot/DrobeBook`)
2. Add PostgreSQL service; reference `DATABASE_URL` on app service
3. Set Shopify env vars + generate public domain
4. Update `shopify.app.production.toml` with Railway URL
5. Run: `npm run deploy -- --config shopify.app.production.toml`
6. Install on client store (Public distribution — may require Shopify review)

**Production URL:** `https://drobebook-production.up.railway.app`

## Theme extension blocks

Add in theme editor (Online Store → Customize):

- **Booking widget** — product page gown hire
- **Try-on widget** — appointment booking
- **Search by date** — landing + results search
- **Cart behaviour** — rental cart rules

## Known issues / notes

- **React Router 7.18.3+** breaks embedded POST actions (CSRF origin check). Pinned to **7.18.2** — see `react-router.config.ts` and `package.json` overrides.
- **Public distribution + App Store submission** blocks install on new stores until Shopify review completes.
- **Emails** require a verified domain on Resend (not `@resend.dev` for customers).
- **Protected customer data** approval may be needed for order/customer webhooks on production stores.

## Git / deploy

- **GitHub:** `devcarnot/DrobeBook`
- **Shopify app:** DrobeBook (`27d4e102059dee2122a57d3f1cc57057`)
- **Latest production release:** `drobebook-5` (theme extension + Railway URLs)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Shopify CLI dev server + tunnel |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run docker-start` | Migrate + start (Docker/Railway) |
| `npm run deploy` | Deploy Shopify app config + extensions |
| `npm test` | Vitest unit tests |
