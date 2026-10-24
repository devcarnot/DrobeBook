# DrobeBook

Shopify embedded app for **GK.Drobe**: gown hire booking, try-on appointments, date-based search, rentals, inventory, and customer notifications.

## Docs

- [App context & architecture](./Context.md)
- [Client setup guide](./docs/DrobeBook-Client-Guide.md) (store + Partner Dashboard)

## Stack

React Router 7, Shopify App Bridge, Polaris, PostgreSQL (Prisma), theme extension `extensions/gk-drobe-booking`, production on [Railway](https://railway.app).

## Config files

| File | Purpose |
|------|---------|
| `shopify.app.toml` | Local dev (`shopify app dev`; CLI may update tunnel URLs) |
| `shopify.app.production.toml` | Production app URLs for deploy |
| `.env` / `.env.example` | Secrets and `DATABASE_URL` (never commit `.env`) |
| `railway.toml` | Railway build/start |

## Development

```shell
npm install
npm run db:up          # optional: local Postgres via Docker
cp .env.example .env   # fill Shopify + DB vars
npm run dev            # Shopify CLI tunnel + app
npm test
npm run typecheck
```

## Deploy

Push to `main` (Railway auto-deploy) or run `npm run deploy` for Shopify app/extension config.

See [AGENTS.md](./AGENTS.md) for AI/agent conventions in this repo.
