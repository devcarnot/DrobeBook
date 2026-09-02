import type { CSSProperties } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop") || url.searchParams.get("host")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

const FEATURES = [
  {
    badge: "Gown Hire",
    title: "Booking widget",
    description:
      "Size, duration, colour, delivery method, calendar availability, and damage protection on product pages.",
  },
  {
    badge: "Try-on",
    title: "Appointment booking",
    description:
      "Weekday and weekend try-on slots with duration selection and checkout from the product page.",
  },
  {
    badge: "Search",
    title: "Search by date",
    description:
      "Shoppers find available gowns by event date and size before they reach a product page.",
  },
] as const;

const FONT_FAMILY =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

export default function LandingPage() {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.logoMark}>DB</div>
          <div>
            <p style={styles.eyebrow}>GK.Drobe · Shopify</p>
            <h1 style={styles.title}>DrobeBook</h1>
          </div>
        </header>

        <section style={styles.hero}>
          <h2 style={styles.heroTitle}>
            Gown hire, try-on appointments, and date search — built for your
            storefront.
          </h2>
          <p style={styles.heroText}>
            Manage booking availability, storefront widgets, blocked dates, and
            customer hire flows from one admin app.
          </p>
        </section>

        <section style={styles.infoCard}>
          <h3 style={styles.infoTitle}>Open from Shopify Admin</h3>
          <p style={styles.infoText}>
            DrobeBook runs inside your Shopify admin. Go to{" "}
            <strong>Apps → DrobeBook</strong> to open the dashboard, edit widget
            text, manage bookings, and configure buffers.
          </p>
          <ul style={styles.infoList}>
            <li>Rental calendar and inventory tracking</li>
            <li>Gown Hire, Try-on, and Search storefront settings</li>
            <li>Buffer rules, blocked dates, and availability controls</li>
          </ul>
        </section>

        <section style={styles.features}>
          {FEATURES.map((feature) => (
            <article key={feature.badge} style={styles.featureCard}>
              <span style={styles.featureBadge}>{feature.badge}</span>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureText}>{feature.description}</p>
            </article>
          ))}
        </section>

        <footer style={styles.footer}>
          <p>© DrobeBook · GK.Drobe booking for Shopify</p>
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    width: "100%",
    boxSizing: "border-box",
    background: "#f6f6f7",
    padding: "48px 32px",
    fontFamily: FONT_FAMILY,
    color: "#202223",
  },
  shell: {
    width: "100%",
    maxWidth: "none",
    margin: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    marginBottom: "40px",
  },
  logoMark: {
    width: "56px",
    height: "56px",
    display: "grid",
    placeItems: "center",
    background: "#111",
    color: "#fff",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  eyebrow: {
    margin: 0,
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#616161",
  },
  title: {
    margin: "4px 0 0",
    fontSize: "32px",
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    color: "#202223",
  },
  hero: {
    marginBottom: "32px",
  },
  heroTitle: {
    margin: "0 0 16px",
    fontSize: "clamp(28px, 4vw, 40px)",
    lineHeight: 1.2,
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    color: "#202223",
  },
  heroText: {
    margin: 0,
    fontSize: "17px",
    lineHeight: 1.6,
    color: "#616161",
  },
  infoCard: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    padding: "28px 32px",
    marginBottom: "32px",
  },
  infoTitle: {
    margin: "0 0 12px",
    fontSize: "20px",
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    color: "#202223",
  },
  infoText: {
    margin: "0 0 20px",
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#616161",
  },
  infoList: {
    margin: 0,
    paddingLeft: "20px",
    display: "grid",
    gap: "10px",
    color: "#202223",
    fontSize: "15px",
    lineHeight: 1.5,
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    width: "100%",
  },
  featureCard: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    padding: "24px",
    display: "grid",
    gap: "12px",
  },
  featureBadge: {
    display: "inline-block",
    width: "fit-content",
    padding: "4px 10px",
    background: "#f1f2f4",
    color: "#202223",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    letterSpacing: "0.02em",
  },
  featureTitle: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 600,
    fontFamily: FONT_FAMILY,
    color: "#202223",
  },
  featureText: {
    margin: 0,
    lineHeight: 1.55,
    color: "#616161",
    fontSize: "14px",
  },
  footer: {
    marginTop: "40px",
    color: "#8c9196",
    fontSize: "14px",
  },
};
