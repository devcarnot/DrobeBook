import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop") || url.searchParams.get("host")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function LandingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.logoMark}>DB</div>
          <div>
            <p className={styles.eyebrow}>GK.Drobe · Shopify</p>
            <h1 className={styles.title}>DrobeBook</h1>
          </div>
        </header>

        <section className={styles.hero}>
          <h2 className={styles.heroTitle}>
            Gown hire, try-on appointments, and date search — built for your
            storefront.
          </h2>
          <p className={styles.heroText}>
            Manage booking availability, storefront widgets, blocked dates, and
            customer hire flows from one admin app.
          </p>
        </section>

        {showForm ? (
          <section className={styles.loginCard}>
            <h3 className={styles.loginTitle}>Connect your store</h3>
            <p className={styles.loginText}>
              Enter your Shopify store domain to open the DrobeBook dashboard.
            </p>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Shop domain</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  required
                />
              </label>
              <button className={styles.button} type="submit">
                Log in to DrobeBook
              </button>
            </Form>
          </section>
        ) : null}

        <section className={styles.features}>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon}>👗</span>
            <h3>Gown hire widget</h3>
            <p>
              Size, duration, colour, delivery method, calendar availability,
              and damage protection on product pages.
            </p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon}>📅</span>
            <h3>Try-on appointments</h3>
            <p>
              Let customers book weekday or weekend try-on slots with duration
              and time selection.
            </p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon}>🔍</span>
            <h3>Search by date</h3>
            <p>
              Shoppers find available gowns by event date and size before they
              reach the product page.
            </p>
          </article>
        </section>

        <footer className={styles.footer}>
          <p>© DrobeBook · GK.Drobe booking for Shopify</p>
        </footer>
      </div>
    </div>
  );
}
