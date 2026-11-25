# Backup Dress Discount — rules & merchant setup

## Edge-case decisions (single source of truth)

| Topic | Decision |
|--------|----------|
| **Quantity (storefront)** | Booking widget always adds **qty 1**. Cart allocation is per line (qty 1). |
| **Quantity (orders)** | Order verification **expands** qty &gt; 1 into separate units for ceil/floor math. |
| **Same gown twice, same period** | **Allowed** — two lines count as two gowns in the group. |
| **Tie-break (equal hire price)** | Sort: price DESC → `createdAt` ASC → `variantId` ASC → `key` ASC. |
| **Rounding** | Backup cents = `round(standardCents × 0.20)` (2 dp when displayed). |
| **Min group** | Fewer than **2** gowns in a hire period → **no** backup; all **Main** / Standard variant. |
| **Fail-safe** | Script or API failure → leave lines on **Standard** variant (full price). |
| **Customer choice** | Customers never select Backup on the product page; widget adds **Standard** only. |

## Business rule

Same delivery date + return date + duration → one **group**. In each group with 2+ gowns: **ceil(n/2)** Main Hire (full Standard price), **floor(n/2)** Backup (20% of Standard).

## Merchant setup

1. DrobeBook → **Backup dress discount** → toggle **ON** → **Sync backup variants** until coverage is complete.
2. Theme → App embed **GK.Drobe Cart** ON.
3. Products: **Size**, **Duration**, **Hire pricing** = `Standard` + `Backup (80% off)` (sync can create backup siblings).
4. Approve app **Edit products** scope when prompted.

## Security (non-Plus)

- Backup variants hidden from product picker, search, and recommendations.
- Cart swaps driven by **server-side** allocation (`/apps/gk-drobe/api/backup-cart-plan`).
- **orders/create** and **orders/paid** webhooks recompute expected pricing; violations → tag `BACKUP-VIOLATION`, admin **Flagged orders**, optional merchant alert.

## Dynamic checkout

**Shop Pay / Apple Pay / Google Pay** dynamic buttons are hidden on cart and product pages (they can skip cart scripts). Customers use normal **Checkout**.

## Cron (Railway)

| Endpoint | Purpose |
|----------|---------|
| `GET /internal/cron/backup-dress` | Re-sync backup variant prices and re-verify orders from the last 14 days (uses `CRON_SECRET`). |
| `GET /internal/cron/notifications` | Existing rental / appointment notifications. |

Set optional `BACKUP_VIOLATION_WEBHOOK_URL` to receive a JSON POST when an order fails verification.