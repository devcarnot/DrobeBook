import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { getDashboardStats } from "../lib/dashboard.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const stats = await getDashboardStats(session.shop);

  return { stats, shop: session.shop };
};

type SetupStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
};

export default function Index() {
  const { stats, shop } = useLoaderData<typeof loader>();

  const setupSteps: SetupStep[] = [
    {
      id: "texts",
      title: "Customize gown hire text",
      description:
        "Edit delivery instructions, postage notes, pickup labels, and button copy.",
      done: stats.widgetTextsCustomized || stats.hasSavedSettings,
      href: "/app/settings",
    },
    {
      id: "protection",
      title: "Choose damage protection product",
      description:
        "Pick the Accidental Damage protection product from your catalog.",
      done: stats.damageProtectionConfigured,
      href: "/app/settings",
    },
    {
      id: "blocked",
      title: "Block unavailable dates",
      description: "Add holidays and closure days for hire availability.",
      done: stats.blockedDateCount > 0,
      href: "/app/inventory",
    },
    {
      id: "cart",
      title: "Enable GK.Drobe Cart embed",
      description:
        "Turn on the cart embed in Theme → App embeds for cart cleanup.",
      done: false,
      href: "/app/settings",
    },
    {
      id: "booking",
      title: "Add gown hire booking block",
      description:
        "Add GK.Drobe Booking to product pages in the theme customizer.",
      done: true,
      href: "/app/settings",
    },
    {
      id: "tryon",
      title: "Add Try-On Appointment block",
      description:
        "Add GK.Drobe Try-On to your try-on appointment product page.",
      done: false,
      href: "/app/settings",
    },
    {
      id: "search",
      title: "Create Search By Date page",
      description:
        "Add a page and the GK.Drobe Search By Date section for event-date search.",
      done: false,
      href: "/app/settings",
    },
  ];

  const completedSteps = setupSteps.filter((step) => step.done).length;
  const progress = Math.round((completedSteps / setupSteps.length) * 100);

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-box
                padding="large"
                background="base"
                borderRadius="base"
                border="base"
              >
                <s-text type="strong">DB</s-text>
              </s-box>
              <s-stack direction="block" gap="small">
                <s-text tone="neutral">Welcome back</s-text>
                <s-heading>DrobeBook</s-heading>
                <s-text tone="neutral">{shop}</s-text>
              </s-stack>
            </s-stack>
            <s-paragraph tone="neutral">
              Manage gown hire bookings, try-on appointments, search-by-date,
              storefront widgets, and blocked dates from one place.
            </s-paragraph>
          </s-stack>
        </s-box>

        <s-stack direction="block" gap="base">
          <s-text type="strong">Overview</s-text>
          <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="large">
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Total bookings</s-text>
              <s-heading>{stats.bookingCount}</s-heading>
              <s-text tone="neutral">All hire records in DrobeBook</s-text>
            </s-stack>
          </s-box>
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Upcoming hires</s-text>
              <s-heading>{stats.upcomingBookingCount}</s-heading>
              <s-text tone="neutral">Confirmed and pending future hires</s-text>
            </s-stack>
          </s-box>
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Blocked dates</s-text>
              <s-heading>{stats.blockedDateCount}</s-heading>
              <s-text tone="neutral">Dates unavailable for booking</s-text>
            </s-stack>
          </s-box>
        </s-grid>
        </s-stack>

        <s-stack direction="block" gap="base">
          <s-text type="strong">Storefront features</s-text>
          <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="large">
          <s-clickable
            href="/app/settings"
            padding="large"
            background="subdued"
            borderRadius="large"
          >
            <s-stack direction="block" gap="small">
              <s-badge tone="info">Gown hire</s-badge>
              <s-text type="strong">Booking widget</s-text>
              <s-paragraph tone="neutral">
                Size, duration, colour, calendar, delivery, and damage
                protection on product pages.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/settings/try-on"
            padding="large"
            background="subdued"
            borderRadius="large"
          >
            <s-stack direction="block" gap="small">
              <s-badge tone="warning">Try-on</s-badge>
              <s-text type="strong">Appointment booking</s-text>
              <s-paragraph tone="neutral">
                Weekday/weekend slots, 50 or 20 minute appointments, and
                checkout flow.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/settings/search"
            padding="large"
            background="subdued"
            borderRadius="large"
          >
            <s-stack direction="block" gap="small">
              <s-badge tone="success">Search</s-badge>
              <s-text type="strong">Search by date</s-text>
              <s-paragraph tone="neutral">
                Customers find available gowns by event date and size before
                browsing products.
              </s-paragraph>
            </s-stack>
          </s-clickable>
        </s-grid>
        </s-stack>

        <s-stack direction="block" gap="base">
          <s-text type="strong">Quick actions</s-text>
          <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="large">
          <s-clickable
            href="/app/settings"
            padding="large"
            background="base"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">Gown hire text &amp; protection</s-text>
              <s-paragraph tone="neutral">
                Widget copy, pickup/post labels, and damage protection product.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/bookings"
            padding="large"
            background="base"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">View bookings</s-text>
              <s-paragraph tone="neutral">
                Recent hire bookings captured from the storefront widget.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/blocked-dates"
            padding="large"
            background="base"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">Manage blocked dates</s-text>
              <s-paragraph tone="neutral">
                Prevent bookings on holidays and closure days.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/settings"
            padding="large"
            background="base"
            border="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">Theme setup checklist</s-text>
              <s-paragraph tone="neutral">
                Enable cart embed and add theme blocks for hire, try-on, and
                search.
              </s-paragraph>
            </s-stack>
          </s-clickable>
        </s-grid>
        </s-stack>

        <s-stack direction="block" gap="base">
          <s-text type="strong">
            Setup progress · {completedSteps}/{setupSteps.length} complete
          </s-text>
        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="inline" gap="large" alignItems="center">
              <s-badge tone={progress === 100 ? "success" : "warning"}>
                {progress}%
              </s-badge>
              <s-text tone="neutral">
                Complete the checklist below to finish storefront setup.
              </s-text>
            </s-stack>
            <s-stack direction="block" gap="large">
              {setupSteps.map((step) => (
                <s-box
                  key={step.id}
                  padding="large"
                  background="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="large" alignItems="start">
                    <s-badge tone={step.done ? "success" : "warning"}>
                      {step.done ? "Done" : "To do"}
                    </s-badge>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{step.title}</s-text>
                      <s-paragraph tone="neutral">{step.description}</s-paragraph>
                      {!step.done ? (
                        <s-link href={step.href}>Complete this step →</s-link>
                      ) : null}
                    </s-stack>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          </s-stack>
        </s-box>
        </s-stack>

        <s-grid gridTemplateColumns="1fr 1fr" gap="large">
          <s-box padding="large" background="subdued" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">How DrobeBook works</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Products, orders, and payments stay in Shopify. DrobeBook adds hire
                scheduling, availability checks, try-on booking, and search-by-date
                on top of your theme.
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-box padding="large" background="subdued" borderRadius="large">
            <s-stack direction="block" gap="small">
              <s-text type="strong">App proxy endpoints</s-text>
              <s-text>/apps/gk-drobe/api/availability</s-text>
              <s-text>/apps/gk-drobe/api/appointment-slots</s-text>
              <s-text>/apps/gk-drobe/api/search-by-date</s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
