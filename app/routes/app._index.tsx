import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { getDashboardStats } from "../lib/dashboard.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const stats = await getDashboardStats(session.shop);

  return { stats };
};

type SetupStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
};

export default function Index() {
  const { stats } = useLoaderData<typeof loader>();

  const setupSteps: SetupStep[] = [
    {
      id: "texts",
      title: "Customize storefront text",
      description:
        "Edit delivery instructions, postage notes, and pickup labels shown on product pages.",
      done: stats.widgetTextsCustomized || stats.hasSavedSettings,
      href: "/app/settings",
    },
    {
      id: "protection",
      title: "Choose damage protection product",
      description:
        "Select your Accidental Damage protection product from the store catalog.",
      done: stats.damageProtectionConfigured,
      href: "/app/settings",
    },
    {
      id: "blocked",
      title: "Block unavailable dates",
      description:
        "Add public holidays or closure days so customers cannot book those dates.",
      done: stats.blockedDateCount > 0,
      href: "/app/blocked-dates",
    },
    {
      id: "cart",
      title: "Enable GK.Drobe Cart embed",
      description:
        "In Online Store → Themes → Customize → App embeds, turn on GK.Drobe Cart so cart cleanup and hide duplicate size lines work.",
      done: false,
      href: "/app/settings",
    },
    {
      id: "theme",
      title: "Add the booking block to your theme",
      description:
        "In Online Store → Themes → Customize, add the GK.Drobe Booking block to product pages.",
      done: true,
      href: "/app/settings",
    },
  ];

  const completedSteps = setupSteps.filter((step) => step.done).length;

  return (
    <s-page heading="Dashboard">
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Total bookings</s-text>
              <s-heading>{stats.bookingCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Upcoming hires</s-text>
              <s-heading>{stats.upcomingBookingCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Blocked dates</s-text>
              <s-heading>{stats.blockedDateCount}</s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Quick actions">
        <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
          <s-clickable
            href="/app/settings"
            padding="base"
            background="subdued"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Edit storefront text</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Delivery instructions, postage note, pickup label, and button
                labels.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/blocked-dates"
            padding="base"
            background="subdued"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Manage blocked dates</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Prevent bookings on holidays and closure days.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/bookings"
            padding="base"
            background="subdued"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">View bookings</s-text>
              <s-paragraph tone="neutral" color="subdued">
                See recent hire bookings from the storefront widget.
              </s-paragraph>
            </s-stack>
          </s-clickable>
          <s-clickable
            href="/app/settings"
            padding="base"
            background="subdued"
            borderRadius="base"
          >
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Widget & damage protection</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Configure damage protection product and cart button text.
              </s-paragraph>
            </s-stack>
          </s-clickable>
        </s-grid>
      </s-section>

      <s-section heading={`Setup guide (${completedSteps}/${setupSteps.length})`}>
        <s-stack direction="block" gap="base">
          {setupSteps.map((step) => (
            <s-box
              key={step.id}
              padding="base"
              background="base"
              border="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base" alignItems="start">
                <s-badge tone={step.done ? "success" : "warning"}>
                  {step.done ? "Done" : "To do"}
                </s-badge>
                <s-stack direction="block" gap="small-200">
                  <s-text type="strong">{step.title}</s-text>
                  <s-paragraph tone="neutral" color="subdued">
                    {step.description}
                  </s-paragraph>
                  {!step.done ? (
                    <s-link href={step.href}>Complete this step →</s-link>
                  ) : null}
                </s-stack>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How DrobeBook works">
        <s-paragraph>
          Products, orders, and payments stay in Shopify. This app adds hire
          scheduling, availability checks, and the storefront booking widget on
          top.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Storefront API">
        <s-paragraph>
          Availability is checked via the app proxy at{" "}
          <s-text>/apps/gk-drobe/api/availability</s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
