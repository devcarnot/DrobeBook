import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  useOutlet,
  useSearchParams,
} from "react-router";

import {
  DEFAULT_WIDGET_CONFIG,
  widgetConfigFromFormData,
  type WidgetConfig,
} from "../lib/shop-settings";
import {
  getShopWidgetConfig,
  saveShopWidgetConfig,
} from "../lib/shop-settings.server";
import { ColorField } from "../components/ColorField";
import { GownHireWidgetPreview } from "../components/GownHireWidgetPreview";
import { DamageProtectionProductPicker } from "../components/DamageProtectionProductPicker";
import { SettingsFeatureNav } from "../components/SettingsFeatureNav";
import {
  DEFAULT_WIDGET_COLORS,
  WIDGET_COLOR_GROUPS,
  type WidgetColorScheme,
} from "../lib/widget-colors";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const SETTINGS_TABS = [
  {
    id: "delivery",
    step: "1",
    label: "Delivery buttons",
    title: "Delivery buttons",
    description: "Short labels for how customers receive their hire.",
  },
  {
    id: "messages",
    step: "2",
    label: "Helpful messages",
    title: "Helpful messages",
    description: "Longer guidance shown around the booking calendar.",
  },
  {
    id: "button",
    step: "3",
    label: "Add to cart",
    title: "Add to cart button",
    description:
      "The main button text changes depending on whether dates are selected.",
  },
  {
    id: "protection",
    step: "4",
    label: "Damage protection",
    title: "Damage protection",
    description:
      "Optional add-on shown during booking. Pick a product from your store.",
  },
  {
    id: "colors",
    step: "5",
    label: "Colors",
    title: "Color scheme",
    description:
      "Match the booking widget to your theme — calendar dates, buttons, and choices.",
  },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

function isSettingsTab(value: string | null): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    appearance: "none",
    border: active ? "1px solid #c9cccf" : "1px solid transparent",
    background: active ? "#ffffff" : "transparent",
    color: active ? "#202223" : "#616161",
    font: "inherit",
    fontSize: "13px",
    fontWeight: 550,
    padding: "10px 16px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  };
}

function tabStepStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "22px",
    height: "22px",
    padding: "0 6px",
    background: active ? "#005bd3" : "#e3f2ff",
    color: active ? "#ffffff" : "#00527c",
    fontSize: "11px",
    fontWeight: 700,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getShopWidgetConfig(session.shop);

  return { config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "reset") {
    await saveShopWidgetConfig(session.shop, DEFAULT_WIDGET_CONFIG);
    return { config: DEFAULT_WIDGET_CONFIG, saved: true, reset: true };
  }

  const config = widgetConfigFromFormData(formData);
  await saveShopWidgetConfig(session.shop, config);

  return { config, saved: true, reset: false };
};

function CharCount({ value, max }: { value: string; max?: number }) {
  const count = value.length;
  if (!max) {
    return (
      <s-text tone="neutral" color="subdued">
        {count} characters
      </s-text>
    );
  }

  return (
    <s-text tone="neutral" color="subdued">
      {count} / {max} characters
    </s-text>
  );
}

function WidgetConfigHiddenFields({ draft }: { draft: WidgetConfig }) {
  const colorKeys = Object.keys(draft.colors) as Array<keyof WidgetColorScheme>;

  return (
    <div hidden aria-hidden="true">
      <input type="hidden" name="postLabel" value={draft.postLabel} />
      <input type="hidden" name="pickupLabel" value={draft.pickupLabel} />
      <input type="hidden" name="deliveryInstructions" value={draft.deliveryInstructions} />
      <input type="hidden" name="postageNote" value={draft.postageNote} />
      <input type="hidden" name="buttonLabelPending" value={draft.buttonLabelPending} />
      <input type="hidden" name="buttonLabelReady" value={draft.buttonLabelReady} />
      <input type="hidden" name="damageProtectionVariantId" value={draft.damageProtectionVariantId} />
      <input type="hidden" name="damageProtectionProductTitle" value={draft.damageProtectionProductTitle} />
      <input type="hidden" name="damageProtectionLabel" value={draft.damageProtectionLabel} />
      <input type="hidden" name="moreInfoLabel" value={draft.moreInfoLabel} />
      <input type="hidden" name="damageProtectionPrice" value={draft.damageProtectionPrice} />
      <input type="hidden" name="damageProtectionMoreInfoUrl" value={draft.damageProtectionMoreInfoUrl} />
      {colorKeys.map((key) => (
        <input key={key} type="hidden" name={`color_${key}`} value={draft.colors[key]} />
      ))}
    </div>
  );
}

function SettingsTabPanel({
  tab,
  draft,
  updateDraft,
  updateDraftColor,
  setDraft,
}: {
  tab: (typeof SETTINGS_TABS)[number];
  draft: WidgetConfig;
  updateDraft: (field: keyof WidgetConfig, value: string) => void;
  updateDraftColor: (field: keyof WidgetColorScheme, value: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<WidgetConfig>>;
}) {
  if (tab.id === "delivery") {
    return (
      <s-grid gridTemplateColumns="1fr 1fr" gap="large">
        <s-text-field
          label="Postage button text"
          value={draft.postLabel}
          placeholder="Post"
          icon="delivery"
          onChange={(event) => updateDraft("postLabel", event.currentTarget.value)}
          details='The label on the postage option, e.g. "Post" or "Nationwide delivery"'
        />
        <s-text-field
          label="Local pickup button text"
          value={draft.pickupLabel}
          placeholder="Local Pickup (Gold Coast, QLD)"
          icon="location"
          onChange={(event) => updateDraft("pickupLabel", event.currentTarget.value)}
          details="Include your city or suburb so customers know where to collect"
        />
      </s-grid>
    );
  }

  if (tab.id === "messages") {
    return (
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text-area
            label="Delivery instructions"
            value={draft.deliveryInstructions}
            placeholder="Select a delivery date 1–2 days before your event…"
            rows={5}
            onChange={(event) =>
              updateDraft("deliveryInstructions", event.currentTarget.value)
            }
            details="Shown below delivery buttons, above the calendar"
          />
          <CharCount value={draft.deliveryInstructions} />
        </s-stack>

        <s-stack direction="block" gap="small">
          <s-text-area
            label="Postage note"
            value={draft.postageNote}
            placeholder="Nationwide postage is $12.50–18.50 and will be added at checkout…"
            rows={4}
            onChange={(event) => updateDraft("postageNote", event.currentTarget.value)}
            details="Shown below the calendar when Post is selected"
          />
          <CharCount value={draft.postageNote} />
        </s-stack>
      </s-stack>
    );
  }

  if (tab.id === "button") {
    return (
      <s-grid gridTemplateColumns="1fr 1fr" gap="large">
        <s-text-field
          label="Before dates are selected"
          value={draft.buttonLabelPending}
          placeholder="Select dates first"
          onChange={(event) =>
            updateDraft("buttonLabelPending", event.currentTarget.value)
          }
        />
        <s-text-field
          label="When ready to add to cart"
          value={draft.buttonLabelReady}
          placeholder="Add hire to cart"
          onChange={(event) =>
            updateDraft("buttonLabelReady", event.currentTarget.value)
          }
        />
      </s-grid>
    );
  }

  if (tab.id === "protection") {
    return (
      <s-stack direction="block" gap="large">
        <DamageProtectionProductPicker
          productTitle={draft.damageProtectionProductTitle}
          variantId={draft.damageProtectionVariantId}
          onSelect={({ productTitle, variantId, displayPrice }) => {
            setDraft((current) => ({
              ...current,
              damageProtectionProductTitle: productTitle,
              damageProtectionVariantId: variantId,
              damageProtectionPrice: displayPrice || current.damageProtectionPrice,
            }));
          }}
          onClear={() => {
            setDraft((current) => ({
              ...current,
              damageProtectionProductTitle: "",
              damageProtectionVariantId: "",
            }));
          }}
        />

        <s-grid gridTemplateColumns="1fr 1fr" gap="large">
          <s-text-field
            label="Checkbox label"
            value={draft.damageProtectionLabel}
            placeholder="Add Damage Protection"
            onChange={(event) =>
              updateDraft("damageProtectionLabel", event.currentTarget.value)
            }
          />
          <s-text-field
            label="More info link text"
            value={draft.moreInfoLabel}
            placeholder="More Info"
            onChange={(event) =>
              updateDraft("moreInfoLabel", event.currentTarget.value)
            }
          />
          <s-text-field
            label="Display price"
            value={draft.damageProtectionPrice}
            placeholder="19.95"
            onChange={(event) =>
              updateDraft("damageProtectionPrice", event.currentTarget.value)
            }
            details="Auto-filled from the product price when you choose a product"
          />
        </s-grid>

        <s-url-field
          label="More info page URL"
          value={draft.damageProtectionMoreInfoUrl}
          placeholder="https://yourstore.com/pages/damage-protection"
          onChange={(event) =>
            updateDraft("damageProtectionMoreInfoUrl", event.currentTarget.value)
          }
          details="Optional — opens when customers click More Info"
        />

        {!draft.damageProtectionVariantId ? (
          <s-banner tone="warning">
            Choose a damage protection product so customers can add it at checkout.
          </s-banner>
        ) : (
          <s-banner tone="success">
            {draft.damageProtectionProductTitle
              ? `${draft.damageProtectionProductTitle} is connected.`
              : "Damage protection is configured."}
          </s-banner>
        )}
      </s-stack>
    );
  }

  return (
    <s-stack direction="block" gap="large">
      {WIDGET_COLOR_GROUPS.map((group) => (
        <s-stack key={group.title} direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-text type="strong">{group.title}</s-text>
            <s-paragraph tone="neutral" color="subdued">
              {group.description}
            </s-paragraph>
          </s-stack>
          <s-box padding="base" background="base" border="base" borderRadius="base">
            {group.fields.map((field, index) => (
              <div
                key={field.key}
                style={
                  index === group.fields.length - 1
                    ? undefined
                    : { borderBottom: "1px solid #edf0f2" }
                }
              >
                <ColorField
                  fieldKey={field.key}
                  label={field.label}
                  value={draft.colors[field.key]}
                  onChange={(value) => updateDraftColor(field.key, value)}
                />
              </div>
            ))}
          </s-box>
        </s-stack>
      ))}

      <s-button
        type="button"
        variant="tertiary"
        onClick={() =>
          setDraft((current) => ({
            ...current,
            colors: { ...DEFAULT_WIDGET_COLORS },
          }))
        }
      >
        Reset colors to defaults
      </s-button>
    </s-stack>
  );
}

function SettingsTips() {
  const tips = [
    {
      title: "Keep messages short",
      body: "Customers read these on mobile. Two or three sentences work best.",
    },
    {
      title: "Damage protection product",
      body: 'Create an "Accidental Damage protection" product in Shopify, then use Choose product above to connect it in one click.',
    },
    {
      title: "Color scheme",
      body: "Use the Colors tab to match calendar and buttons to your theme. Changes apply to booking, try-on, and search widgets.",
    },
    {
      title: "Theme block heading",
      body: 'The widget title (e.g. "Book this gown") is edited in Online Store → Themes → Customize.',
    },
  ];

  return (
    <s-box padding="large" background="subdued" borderRadius="large">
      <s-stack direction="block" gap="large">
        <s-text type="strong">Tips</s-text>
        {tips.map((tip, index) => (
          <s-stack key={tip.title} direction="block" gap="small">
            {index > 0 ? <s-divider /> : null}
            <s-text type="strong">{tip.title}</s-text>
            <s-paragraph tone="neutral" color="subdued">
              {tip.body}
            </s-paragraph>
          </s-stack>
        ))}
      </s-stack>
    </s-box>
  );
}

export default function SettingsRoute() {
  const outlet = useOutlet();
  if (outlet) {
    return outlet;
  }

  return <GownHireSettingsPage />;
}

function GownHireSettingsPage() {
  const { config: loaderConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSaved, setShowSaved] = useState(false);
  const [draft, setDraft] = useState<WidgetConfig>(loaderConfig);

  const tabParam = searchParams.get("tab");
  const activeTabId: SettingsTabId = isSettingsTab(tabParam)
    ? tabParam
    : "delivery";
  const activeTabIndex = SETTINGS_TABS.findIndex((tab) => tab.id === activeTabId);
  const activeTab = SETTINGS_TABS[activeTabIndex] ?? SETTINGS_TABS[0];

  const config = actionData?.config ?? loaderConfig;

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (actionData?.saved) {
      setShowSaved(true);
    }
  }, [actionData]);

  const isSaving =
    navigation.state === "submitting" || navigation.state === "loading";

  const updateDraft = (field: keyof WidgetConfig, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateDraftColor = (field: keyof WidgetColorScheme, value: string) => {
    setDraft((current) => ({
      ...current,
      colors: { ...current.colors, [field]: value },
    }));
  };

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  function selectTab(tabId: SettingsTabId) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabId);
    setSearchParams(next, { replace: true });
  }

  function goToAdjacentTab(direction: -1 | 1) {
    const nextIndex = activeTabIndex + direction;
    if (nextIndex >= 0 && nextIndex < SETTINGS_TABS.length) {
      selectTab(SETTINGS_TABS[nextIndex].id);
    }
  }

  return (
    <s-page heading="Gown Hire" inlineSize="large">
      <s-stack direction="block" gap="large">
        {showSaved ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowSaved(false)}>
            {actionData?.reset
              ? "All gown hire text reset to defaults. Refresh your storefront to see changes."
              : "Gown hire text saved successfully. Refresh your storefront to see changes."}
          </s-banner>
        ) : null}

        <SettingsFeatureNav active="gown-hire" />

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="info" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Gown hire booking widget</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Edit delivery labels, calendar messages, cart button copy, damage
                protection, and colors for product page bookings.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <s-grid gridTemplateColumns="1.4fr 1fr" gap="large" alignItems="start">
          <Form method="post">
            <input type="hidden" name="intent" value="save" />

            <s-box padding="large" background="base" border="base" borderRadius="large">
              <s-stack direction="block" gap="large">
                <div
                  role="tablist"
                  aria-label="Gown hire text steps"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    padding: "8px",
                    background: "#f6f6f7",
                    border: "1px solid #e1e3e5",
                  }}
                >
                  {SETTINGS_TABS.map((tab) => {
                    const active = activeTabId === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        style={tabButtonStyle(active)}
                        onClick={() => selectTab(tab.id)}
                      >
                        <span style={tabStepStyle(active)}>{tab.step}</span>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <s-divider />

                <s-stack direction="block" gap="small">
                  <s-text type="strong">{activeTab.title}</s-text>
                  <s-paragraph tone="neutral" color="subdued">
                    {activeTab.description}
                  </s-paragraph>
                </s-stack>

                <SettingsTabPanel
                  tab={activeTab}
                  draft={draft}
                  updateDraft={updateDraft}
                  updateDraftColor={updateDraftColor}
                  setDraft={setDraft}
                />

                <WidgetConfigHiddenFields draft={draft} />

                <s-divider />

                <s-stack direction="block" gap="large">
                  <s-stack direction="inline" gap="large" alignItems="center">
                    <s-button
                      type="submit"
                      variant="primary"
                      icon="save"
                      accessibilityLabel="Save gown hire text"
                      {...(isSaving ? { loading: true } : {})}
                    >
                      Save gown hire text
                    </s-button>
                    {isDirty ? (
                      <s-badge tone="warning">Unsaved changes</s-badge>
                    ) : (
                      <s-badge tone="success">All saved</s-badge>
                    )}
                  </s-stack>

                  <s-stack
                    direction="inline"
                    gap="large"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-button
                      type="button"
                      variant="tertiary"
                      disabled={activeTabIndex === 0}
                      onClick={() => goToAdjacentTab(-1)}
                    >
                      Previous step
                    </s-button>
                    <s-button
                      type="button"
                      variant="tertiary"
                      disabled={activeTabIndex === SETTINGS_TABS.length - 1}
                      onClick={() => goToAdjacentTab(1)}
                    >
                      Next step
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-stack>
            </s-box>
          </Form>

          <s-stack direction="block" gap="large">
            <GownHireWidgetPreview config={draft} />
            <SettingsTips />
          </s-stack>
        </s-grid>

        <Form method="post">
          <s-box padding="large" background="subdued" borderRadius="large">
            <s-stack direction="inline" gap="large" alignItems="center">
              <input type="hidden" name="intent" value="reset" />
              <s-button
                type="submit"
                variant="tertiary"
                tone="critical"
                {...(isSaving ? { loading: true } : {})}
              >
                Reset everything to defaults
              </s-button>
              <s-text tone="neutral" color="subdued">
                This restores all fields to the original GK.Drobe text
              </s-text>
            </s-stack>
          </s-box>
        </Form>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
