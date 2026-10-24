# DrobeBook — Client Guide  
**For GK Drobe (and your team)**  
*Simple guide to using and testing your gown hire app*

**Store:** GK Drobe  
**Contact email:** gk.drobe@gmail.com

---

## About this document

This guide explains **what DrobeBook does**, **how to open it**, and **how to test** the main features on your Shopify store.  
You do **not** need to be technical. Follow the steps in order when you are setting up for the first time.

**To save as PDF:** Open this file in Microsoft Word, Google Docs, or any editor → **Print** → **Save as PDF**.

---

## 1. What is DrobeBook?

DrobeBook is an app that works **inside your Shopify Admin**. It helps you run:

| Feature | What it does for your business |
|--------|--------------------------------|
| **Gown hire (booking)** | Customers choose size, dates, and delivery on your website and add a hire to the cart. |
| **Try-on appointments** | Customers book a time to try gowns in your studio (or you book for them). |
| **Search by date** | Customers search your site for gowns available around their event date. |
| **Rentals list** | You see every hire in one place and track status (packed, sent, returned, etc.). |
| **Inventory & calendar** | You see which gown is booked on which dates. |
| **Waitlist** | When a gown is unavailable, customers can leave their email; you can contact them when it frees up. |
| **Email notifications** | Automatic or manual emails to customers (when email is fully set up). |

**Important:** Customers use your **normal website**. The app runs in the background and in **Shopify Admin** for you and your staff.

---

## 2. How the app fits together (simple picture)

```
Customer on your website
    ↓
Uses booking / try-on / search widgets (on product pages or search page)
    ↓
Adds to cart and pays in Shopify checkout (as usual)
    ↓
Shopify sends the order to your store
    ↓
DrobeBook reads the order and creates or confirms the hire or appointment
    ↓
You manage everything in DrobeBook inside Shopify Admin
```

You **do not** log in to a separate website for day-to-day work. You use **Shopify Admin → Apps → DrobeBook**.

---

## 3. How to open DrobeBook

1. Log in to **Shopify Admin** for your store (same as you always do).
2. Click **Apps** in the left menu.
3. Click **DrobeBook**.
4. The app opens **inside** Shopify (you stay in one place).

If the app asks you to approve access the first time, click **Install** or **Allow** — that is normal.

---

## 4. First-time setup checklist

Do these once (or when your developer asks you to). Tick each box when done.

### A. Theme (your website look)

1. In Shopify Admin go to **Online Store → Themes**.
2. Click **Customize** on your live theme.
3. **App embeds** (left panel): find **GK.Drobe Cart** → turn it **ON** → **Save**.
4. Open a **product page** template (for a gown you hire out):
   - Add block **GK.Drobe Booking** (gown hire).
   - Add **GK.Drobe Try-On** if you offer try-ons on that page.
5. On your search or collection page (if you use date search):
   - Add block **Search by date** where your developer showed you.
6. Click **Save** on the theme.

### B. Products in DrobeBook

1. Open **DrobeBook → Products**.
2. **Import** gowns from Shopify (select products → import).
3. Open each gown → **turn on rental** and complete any setup steps shown.
4. Use the **Dashboard** quick-start guide if it appears — it walks you through the same ideas.

### C. Basic settings

1. **Store Front widget** — wording, colours, delivery options, damage protection link.
2. **Buffer settings** — how many days before/after a hire the gown is blocked (travel time, cleaning).
3. **Blocked dates** — public holidays or days you are closed.

Your developer handles **hosting and app connection** (Railway, etc.). You only need Shopify Admin and this guide for daily use.

---

## 5. Menu guide — what each section is for

Use the **top menu** inside DrobeBook:

| Menu item | Use it when you want to… |
|-----------|---------------------------|
| **Dashboard** | See totals (rentals, products, blocked dates) and reopen the setup guide. |
| **Products** | Import Shopify gowns and turn hire on/off per product. |
| **Rentals** | See all hires, add a manual hire, change status, send a customer email. |
| **Store Front widget** | Change text and options customers see on the booking widget. |
| **Buffer settings** | Set lead time and buffers around hire dates. |
| **Blocked dates** | Block dates when no hires should start/end. |
| **Inventory & Bookings** | See each gown’s calendar, revenue stats, book a try-on for a customer. |
| **Rental calendar** | Month view of all confirmed hires. |
| **Waitlist** | See who asked to be notified when a gown is free. |
| **Notifications** | Turn emails on/off and edit email templates (when email is active). |

**Try-on settings:** Inside **Store Front widget**, use the links for **Try-on** and **Search by date** (tabs or sub-pages) to set appointment products, times, and search page text.

---

## 6. Day-to-day tasks (step by step)

### 6.1 When a customer hires a gown online

1. Customer completes checkout on your website (normal Shopify order).
2. Open **DrobeBook → Rentals** — a new rental should appear (may take a minute).
3. Open the rental to see dates, size, customer email, and linked order number.
4. Update **workflow status** as you work, for example:
   - **Confirmed** → **Packed** → **Dispatched** → **Returned**
5. Add **tracking links** on the rental if you post the gown out.

**If a rental is missing:** Open **Rental calendar** or **Inventory & Bookings** and use **Sync orders** if that button is shown, or ask your developer.

---

### 6.2 When you create a hire manually (phone or in-store)

1. Go to **Rentals**.
2. Click to **create a new rental** (or **New rental**).
3. Choose the **gown**, **customer** (from Shopify customers), **dates**, and **delivery**.
4. Choose whether to create a **Shopify order** or not (options are on the form).
5. Save — the hire appears in your list and on the calendar.

---

### 6.3 When a customer books a try-on online

1. They use the **Try-On** widget on your site and pay if your setup requires checkout.
2. After order, the appointment appears in **Inventory & Bookings** (open the gown) or your try-on calendar tools.
3. If you offer **hire credit after try-on**, the app can create a discount code when the order is paid (your developer configures this).

---

### 6.4 When you book a try-on for a customer (in the shop)

1. Go to **Inventory & Bookings**.
2. Open the **gown** they want to try.
3. Click **Book try-on appointment**.
4. Fill in date, time, customer name and email, and save.

---

### 6.5 Waitlist

1. Customer joins waitlist on the website when a gown is unavailable.
2. You see entries under **Waitlist**.
3. **Email customer** opens your email app with a pre-filled message (or automated email when notifications are on).
4. Mark **Contacted** or **Fulfilled** so your team stays organised.
5. When a hire is **cancelled**, the app may automatically email the next person on the waitlist (if notifications are enabled).

---

### 6.6 Email notifications

When email is fully set up (Resend + your domain):

1. Go to **Notifications**.
2. Keep **Automated notifications** ON if you want automatic emails.
3. Edit templates (wording only — do not delete special words in curly brackets like `{{customerFirstName}}` unless your developer says so).
4. On a rental page you can **Send email** manually with a chosen template.

Until email is set up, the app may still **record** that an email would send, but messages might only be logged for your developer to check — ask them when go-live email is ready.

---

## 7. Testing guide (for you or your staff)

Use a **test product** or low-value gown first. You can refund test orders in Shopify after.

### Test 1 — Gown hire on the website

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Open a rental-enabled product on your **live** storefront (not admin). | ☐ |
| 2 | Choose size, duration, delivery, and valid dates on the calendar. | ☐ |
| 3 | Add hire to cart and complete checkout (test payment mode if available). | ☐ |
| 4 | In **DrobeBook → Rentals**, find the new rental with correct dates. | ☐ |
| 5 | In **Rental calendar**, see the booking on the right day. | ☐ |

---

### Test 2 — Try-on booking

| Step | Action | Pass? |
|------|--------|-------|
| 1 | On a product with try-on widget, pick a date and time slot. | ☐ |
| 2 | Complete checkout if required. | ☐ |
| 3 | Confirm the appointment shows under that gown in **Inventory & Bookings**. | ☐ |

---

### Test 3 — Search by date

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Open the page where **Search by date** is added. | ☐ |
| 2 | Enter event date, size, and filters; run search. | ☐ |
| 3 | Results show gowns that should be available (spot-check one on the calendar). | ☐ |

---

### Test 4 — Manual rental and status

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Create a **manual rental** in Admin with a test customer. | ☐ |
| 2 | Change status to **Dispatched** and save. | ☐ |
| 3 | Confirm it still appears correctly on **Rental calendar**. | ☐ |

---

### Test 5 — Waitlist (optional)

| Step | Action | Pass? |
|------|--------|-------|
| 1 | On an unavailable date, submit waitlist with a test email. | ☐ |
| 2 | See the entry in **Waitlist**. | ☐ |
| 3 | Mark as contacted / fulfilled and confirm status updates. | ☐ |

---

### Test 6 — Email (when your developer confirms email is live)

| Step | Action | Pass? |
|------|--------|-------|
| 1 | Open a rental with your own email as customer. | ☐ |
| 2 | Send a **manual** notification from the rental page. | ☐ |
| 3 | Check your inbox (and spam folder). | ☐ |

---

## 8. Common questions (non-technical)

**Do I need another login?**  
No — only Shopify Admin.

**Will this change how I get paid?**  
No — money still goes through **Shopify checkout** as today.

**What if the calendar looks wrong on the website?**  
Check **Buffer settings** and **Blocked dates**, and that the gown is **rental enabled** in **Products**.

**What if widgets don’t show on the site?**  
Check theme **GK.Drobe Cart** embed is ON and **GK.Drobe Booking** block is on the product page — then **Save** theme.

**Who fixes technical problems?**  
Your developer (hosting, app updates, email domain). You handle products, theme toggles, and daily rental workflow.

**Is my customer data safe?**  
Data stays tied to your Shopify store; uninstall and privacy rules are handled as part of the app’s compliance setup.

---

## 9. Quick reference — rental statuses

| Status | Meaning (typical use) |
|--------|------------------------|
| **Reserved / Confirmed** | Hire is booked. |
| **Packed** | Gown prepared to send. |
| **Dispatched** | Sent or ready for pickup. |
| **Returned** | Gown is back. |
| **Cancelled** | Hire cancelled; dates may free up for others/waitlist. |

Use the statuses your team agrees on — the app keeps everyone on the same page.

---

## 10. Support contacts

| Role | Name | Contact |
|------|------|---------|
| Store (GK Drobe) | GK Drobe team | gk.drobe@gmail.com |
| Shopify help (orders, payments, theme) | Shopify Support | help.shopify.com |
| App technical support (DrobeBook setup, hosting, email) | Your developer | _(contact your developer)_ |

---

## Document version

- **Store name:** GK Drobe  
- **Store email:** gk.drobe@gmail.com  
- **App name:** DrobeBook  
- **Guide purpose:** Client use and testing  
- **Update when:** Major new features are added to the app  

---

*End of client guide*
