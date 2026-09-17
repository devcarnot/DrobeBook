import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { ResponsiveGrid } from "../components/ResponsiveGrid";
import {
  completeOnboarding,
  getDashboardPageData,
  resetOnboardingGuide,
  saveRentalDurationMode,
} from "../lib/dashboard.server";
import type { RentalDurationMode } from "../lib/shop-config";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await getDashboardPageData(session.shop);

  return { ...data, shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save-duration-mode") {
    const mode = String(formData.get("rentalDurationMode") ?? "predefined") as RentalDurationMode;
    await saveRentalDurationMode(
      session.shop,
      mode === "manual" ? "manual" : "predefined",
    );
    return { ok: true, message: "Rental duration preference saved." };
  }

  if (intent === "complete-onboarding") {
    await completeOnboarding(session.shop);
    return { ok: true, message: "Onboarding complete. Welcome to your dashboard." };
  }

  if (intent === "show-setup-guide") {
    await resetOnboardingGuide(session.shop);
    return { ok: true, message: "Setup guide reopened." };
  }

  return { ok: false, message: "Unknown action." };
};

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="gk-quickstart-progress">
      <div className="gk-quickstart-progress__meta">
        <span>
          {completed} / {total} completed
        </span>
        <span>{percent}%</span>
      </div>
      <div className="gk-quickstart-progress__track" aria-hidden="true">
        <div
          className="gk-quickstart-progress__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StepBadge({
  done,
  number,
}: {
  done: boolean;
  number: number;
}) {
  return (
    <span
      className={`gk-quickstart-step__badge${done ? " gk-quickstart-step__badge--done" : ""}`}
      aria-hidden="true"
    >
      {done ? "✓" : number}
    </span>
  );
}

function ChoiceCard({
  title,
  description,
  selected,
  onSelect,
  recommended = false,
  disabled = false,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`gk-quickstart-choice${selected ? " gk-quickstart-choice--selected" : ""}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
    >
      {recommended ? <span className="gk-quickstart-choice__tag">Recommended</span> : null}
      <strong>{title}</strong>
      <p>{description}</p>
    </button>
  );
}

function QuickstartStep({
  number,
  title,
  done,
  open,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`gk-quickstart-step${open ? " gk-quickstart-step--open" : ""}`}>
      <button type="button" className="gk-quickstart-step__header" onClick={onToggle}>
        <StepBadge done={done} number={number} />
        <span className="gk-quickstart-step__title">{title}</span>
        <span className="gk-quickstart-step__chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? <div className="gk-quickstart-step__body">{children}</div> : null}
    </div>
  );
}

function SetupLinkList({
  items,
}: {
  items: Array<{ label: string; description: string; href: string; external?: boolean }>;
}) {
  return (
    <div className="gk-quickstart-links">
      {items.map((item) =>
        item.external ? (
          <a
            key={item.href}
            href={item.href}
            className="gk-quickstart-links__item"
            target="_blank"
            rel="noreferrer"
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </a>
        ) : (
          <s-link key={item.href} href={item.href}>
            <span className="gk-quickstart-links__item">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </span>
          </s-link>
        ),
      )}
    </div>
  );
}

function OperationalDashboard({
  data,
}: {
  data: Awaited<ReturnType<typeof loader>>;
}) {
  const storefrontUrl = data.firstRentalProductHandle
    ? `https://${data.shop}/products/${data.firstRentalProductHandle}`
    : `https://${data.shop}`;

  return (
    <s-stack direction="block" gap="large">
      <s-box padding="large" background="subdued" borderRadius="large">
        <s-stack direction="inline" gap="large" alignItems="center" justifyContent="space-between">
          <s-stack direction="block" gap="small">
            <s-heading>DrobeBook dashboard</s-heading>
            <s-text tone="neutral" color="subdued">
              Manage rentals, products, storefront widgets, and availability from one place.
            </s-text>
          </s-stack>
          <Form method="post">
            <input type="hidden" name="intent" value="show-setup-guide" />
            <s-button type="submit" variant="secondary">
              View setup guide
            </s-button>
          </Form>
        </s-stack>
      </s-box>

      <ResponsiveGrid layout="4">
        <s-box padding="large" background="base" border="base" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text tone="neutral">Total rentals</s-text>
            <s-heading>{data.bookingCount}</s-heading>
          </s-stack>
        </s-box>
        <s-box padding="large" background="base" border="base" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text tone="neutral">Upcoming hires</s-text>
            <s-heading>{data.upcomingBookingCount}</s-heading>
          </s-stack>
        </s-box>
        <s-box padding="large" background="base" border="base" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text tone="neutral">Rental products</s-text>
            <s-heading>{data.rentalEnabledProductCount}</s-heading>
          </s-stack>
        </s-box>
        <s-box padding="large" background="base" border="base" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text tone="neutral">Blocked dates</s-text>
            <s-heading>{data.blockedDateCount}</s-heading>
          </s-stack>
        </s-box>
      </ResponsiveGrid>

      <ResponsiveGrid layout="3">
        <s-clickable href="/app/rentals" padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-badge tone="info">Operations</s-badge>
            <s-text type="strong">Rentals</s-text>
            <s-paragraph tone="neutral">
              Track hire bookings, fulfillment, returns, and manual rentals.
            </s-paragraph>
          </s-stack>
        </s-clickable>
        <s-clickable href="/app/products" padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-badge tone="success">Catalog</s-badge>
            <s-text type="strong">Products</s-text>
            <s-paragraph tone="neutral">
              Import Shopify products and enable the gown hire widget per product.
            </s-paragraph>
          </s-stack>
        </s-clickable>
        <s-clickable href="/app/bookings" padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-badge tone="warning">Calendar</s-badge>
            <s-text type="strong">Rental calendar</s-text>
            <s-paragraph tone="neutral">
              View confirmed hires, buffers, and blackout periods at a glance.
            </s-paragraph>
          </s-stack>
        </s-clickable>
      </ResponsiveGrid>

      <ResponsiveGrid layout="2">
        <s-clickable href="/app/settings" padding="large" background="base" border="base" borderRadius="large">
          <s-text type="strong">Storefront widget settings</s-text>
          <s-paragraph tone="neutral">
            Gown hire copy, damage protection, try-on, and search-by-date widgets.
          </s-paragraph>
        </s-clickable>
        <s-link href={storefrontUrl} target="_blank">
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-text type="strong">View storefront</s-text>
            <s-paragraph tone="neutral">
              Open your live store
              {data.firstRentalProductTitle ? ` and preview ${data.firstRentalProductTitle}` : ""}.
            </s-paragraph>
          </s-box>
        </s-link>
      </ResponsiveGrid>
    </s-stack>
  );
}

function QuickstartDashboard({
  data,
}: {
  data: Awaited<ReturnType<typeof loader>>;
}) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "save-duration-mode";

  const [openStep, setOpenStep] = useState(
    data.onboarding.durationModeConfirmed ? 2 : 1,
  );
  const [otherOpen, setOtherOpen] = useState(false);
  const [durationMode, setDurationMode] = useState<RentalDurationMode>(
    data.onboarding.rentalDurationMode,
  );

  useEffect(() => {
    setDurationMode(data.onboarding.rentalDurationMode);
  }, [data.onboarding.rentalDurationMode]);

  const stepDone = useMemo(
    () => ({
      duration: data.onboarding.durationModeConfirmed,
      product: data.rentalEnabledProductCount > 0,
      storefront: data.storefrontConfigured,
      preview: data.rentalEnabledProductCount > 0 && data.storefrontConfigured,
    }),
    [data],
  );

  const themeEditorUrl = `https://admin.shopify.com/store/${data.storeHandle}/themes/current/editor`;
  const previewUrl = data.firstRentalProductHandle
    ? `https://${data.shop}/products/${data.firstRentalProductHandle}`
    : `https://${data.shop}`;

  const otherActivities = [
    {
      label: "Buffer settings",
      description: "Lead time, cut-off, and before/after rental buffers.",
      href: "/app/buffer-settings",
    },
    {
      label: "Blocked dates",
      description: "Holidays and closure days when hire is unavailable.",
      href: "/app/blocked-dates",
    },
    {
      label: "Gown hire widget text",
      description: "Delivery instructions, labels, and damage protection.",
      href: "/app/settings",
    },
    {
      label: "Try-on appointments",
      description: "Slot capacity, copy, and checkout flow for try-ons.",
      href: "/app/settings/try-on",
    },
    {
      label: "Search by date",
      description: "Event-date search page for available gowns.",
      href: "/app/settings/search",
    },
    {
      label: "Inventory & bookings",
      description: "Garment revenue, profit, and synced order bookings.",
      href: "/app/inventory",
    },
  ];

  return (
    <s-stack direction="block" gap="large">
      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
      ) : null}

      <s-box padding="large" background="base" border="base" borderRadius="large">
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-heading>My First Rental Product – Quickstart Guide</s-heading>
            <s-text tone="neutral" color="subdued">
              Fast-track getting a rental product with calendar working on your store.
            </s-text>
          </s-stack>

          <ProgressBar
            completed={data.quickstartCompletedCount}
            total={data.quickstartTotal}
          />

          <div className="gk-quickstart-steps">
            <QuickstartStep
              number={1}
              title="Select how rental durations are handled"
              done={stepDone.duration}
              open={openStep === 1}
              onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
            >
              <s-stack direction="block" gap="base">
                <s-text tone="neutral" color="subdued">
                  DrobeBook supports predefined hire lengths through Shopify variants (for example
                  4-day and 8-day options). Choose the model that fits your store.
                </s-text>
                <div className="gk-quickstart-choices">
                  <ChoiceCard
                    title="Predefined rental durations"
                    description="Use Shopify variants for set hire lengths such as 4 days or 8 days. Best for gown hire with size and duration options."
                    selected={durationMode === "predefined"}
                    onSelect={() => setDurationMode("predefined")}
                    recommended
                  />
                  <ChoiceCard
                    title="Manually-selected date ranges"
                    description="Let customers pick any start and end date on the calendar. Useful for flexible hire periods."
                    selected={durationMode === "manual"}
                    onSelect={() => setDurationMode("manual")}
                  />
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="save-duration-mode" />
                  <input type="hidden" name="rentalDurationMode" value={durationMode} />
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>
                      Save
                    </s-button>
                    {durationMode === "manual" ? (
                      <s-text tone="neutral" color="subdued">
                        Configure custom duration buttons in Store Front widget → Hire durations.
                      </s-text>
                    ) : (
                      <s-link href="/app/settings?tab=durations">
                        Edit default 4 and 8 day options in Hire durations settings
                      </s-link>
                    )}
                  </s-stack>
                </Form>
              </s-stack>
            </QuickstartStep>

            <QuickstartStep
              number={2}
              title="Import and configure your first rental product"
              done={stepDone.product}
              open={openStep === 2}
              onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)}
            >
              <s-stack direction="block" gap="base">
                <s-text tone="neutral" color="subdued">
                  Import a gown from Shopify, configure sizes/variants, then enable rentals so the
                  booking widget appears only on that product.
                </s-text>
                <s-stack direction="inline" gap="small">
                  <s-link href="/app/products/import">
                    <s-button variant="primary">Import Products</s-button>
                  </s-link>
                  <s-link href="/app/products">
                    <s-button variant="secondary">View imported products</s-button>
                  </s-link>
                </s-stack>
                {data.importedProductCount > 0 && data.rentalEnabledProductCount === 0 ? (
                  <s-banner tone="warning">
                    {data.importedProductCount} product
                    {data.importedProductCount === 1 ? " is" : "s are"} imported but rentals are
                    not enabled yet. Open a product and turn on rentals.
                  </s-banner>
                ) : null}
                {data.rentalEnabledProductCount > 0 ? (
                  <s-banner tone="success">
                    {data.rentalEnabledProductCount} rental product
                    {data.rentalEnabledProductCount === 1 ? " is" : "s are"} ready
                    {data.firstRentalProductTitle ? `: ${data.firstRentalProductTitle}` : ""}.
                  </s-banner>
                ) : null}
              </s-stack>
            </QuickstartStep>

            <QuickstartStep
              number={3}
              title="Enable the cart manager and add the rental widget in your theme"
              done={stepDone.storefront}
              open={openStep === 3}
              onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)}
            >
              <s-stack direction="block" gap="base">
                <s-text tone="neutral" color="subdued">
                  Turn on the DrobeBook cart embed, add the GK.Drobe Booking block to your product
                  template, and review buffer settings for lead time.
                </s-text>
                <SetupLinkList
                  items={[
                    {
                      label: "Open theme editor",
                      description: "Enable GK.Drobe Cart embed and add GK.Drobe Booking block.",
                      href: themeEditorUrl,
                      external: true,
                    },
                    {
                      label: "Buffer settings",
                      description: "Configure lead time, cut-off, and rental buffers.",
                      href: "/app/buffer-settings",
                    },
                    {
                      label: "Gown hire widget settings",
                      description: "Customize delivery copy and damage protection product.",
                      href: "/app/settings",
                    },
                  ]}
                />
              </s-stack>
            </QuickstartStep>

            <QuickstartStep
              number={4}
              title="See how the rental product looks on your store"
              done={stepDone.preview}
              open={openStep === 4}
              onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)}
            >
              <s-stack direction="block" gap="base">
                <s-text tone="neutral" color="subdued">
                  Preview the product page on your storefront and confirm size, duration, calendar,
                  and add-to-cart flow.
                </s-text>
                <s-stack direction="inline" gap="small">
                  <s-link href={previewUrl} target="_blank">
                    <s-button variant="primary">Preview storefront product</s-button>
                  </s-link>
                  {data.firstRentalProductShopifyId ? (
                    <s-link
                      href={`https://admin.shopify.com/store/${data.storeHandle}/products/${data.firstRentalProductShopifyId}`}
                      target="_blank"
                    >
                      <s-button variant="secondary">Open in Shopify admin</s-button>
                    </s-link>
                  ) : null}
                </s-stack>
              </s-stack>
            </QuickstartStep>
          </div>
        </s-stack>
      </s-box>

      <s-box padding="large" background="base" border="base" borderRadius="large">
        <button
          type="button"
          className="gk-quickstart-collapse"
          onClick={() => setOtherOpen((current) => !current)}
          aria-expanded={otherOpen}
        >
          <span>Other Common Setup Activities</span>
          <span aria-hidden="true">{otherOpen ? "▴" : "▾"}</span>
        </button>
        {otherOpen ? <SetupLinkList items={otherActivities} /> : null}
      </s-box>

      <s-box padding="large" background="subdued" borderRadius="large">
        <s-stack direction="block" gap="base">
          <s-text type="strong">Done with setup tasks?</s-text>
          <s-paragraph tone="neutral">
            Click the button below to go to your dashboard. You won&apos;t see this guide again —
            the dashboard will become your home screen.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="complete-onboarding" />
            <s-button type="submit" variant="primary" icon="check-circle">
              Complete onboarding
            </s-button>
          </Form>
        </s-stack>
      </s-box>
    </s-stack>
  );
}

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard" inlineSize="large">
      {data.onboarding.completed ? (
        <OperationalDashboard data={data} />
      ) : (
        <QuickstartDashboard data={data} />
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
