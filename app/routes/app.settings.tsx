import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  DEFAULT_WIDGET_CONFIG,
  widgetConfigFromFormData,
  type WidgetConfig,
} from "../lib/shop-settings";
import {
  getShopWidgetConfig,
  saveShopWidgetConfig,
} from "../lib/shop-settings.server";
import { DamageProtectionProductPicker } from "../components/DamageProtectionProductPicker";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

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

function SectionCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <s-box
      padding="large"
      background="base"
      border="base"
      borderRadius="large"
    >
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone="info">{step}</s-badge>
            <s-heading>{title}</s-heading>
          </s-stack>
          <s-paragraph tone="neutral" color="subdued">
            {description}
          </s-paragraph>
        </s-stack>
        <s-divider direction="inline" />
        {children}
      </s-stack>
    </s-box>
  );
}

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

function WidgetPreview({ config }: { config: WidgetConfig }) {
  const ready = Boolean(config.deliveryInstructions && config.postageNote);

  return (
    <s-box
      padding="large"
      background="base"
      border="base"
      borderRadius="large"
    >
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-icon type="view" />
            <s-text type="strong">Live preview</s-text>
          </s-stack>
          <s-paragraph tone="neutral" color="subdued">
            Updates as you type — this is how customers see your booking widget.
          </s-paragraph>
        </s-stack>

        <s-box
          padding="large"
          background="subdued"
          borderRadius="large"
          border="base"
        >
          <s-stack direction="block" gap="base">
            <s-text type="strong">Book this gown</s-text>

            <s-stack direction="block" gap="small-200">
              <s-text tone="neutral">Delivery method</s-text>
              <s-stack direction="inline" gap="small">
                <s-chip color="strong">{config.postLabel || "Post"}</s-chip>
                <s-chip color="base">{config.pickupLabel || "Local Pickup"}</s-chip>
              </s-stack>
            </s-stack>

            {config.deliveryInstructions ? (
              <s-box padding="base" background="base" borderRadius="base">
                <s-paragraph tone="neutral" color="subdued">
                  {config.deliveryInstructions}
                </s-paragraph>
              </s-box>
            ) : (
              <s-box padding="base" background="base" borderRadius="base">
                <s-paragraph tone="neutral" color="subdued">
                  Your delivery instructions will appear here…
                </s-paragraph>
              </s-box>
            )}

            <s-box
              padding="base"
              background="base"
              borderRadius="base"
              border="base"
            >
              <s-text tone="neutral">Calendar area</s-text>
            </s-box>

            {config.postageNote ? (
              <s-paragraph tone="neutral" color="subdued">
                {config.postageNote}
              </s-paragraph>
            ) : null}

            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text>☑ {config.damageProtectionLabel}</s-text>
              {config.damageProtectionMoreInfoUrl ? (
                <s-link href={config.damageProtectionMoreInfoUrl} target="_blank">
                  {config.moreInfoLabel}
                </s-link>
              ) : (
                <s-text tone="neutral" color="subdued">
                  {config.moreInfoLabel}
                </s-text>
              )}
              <s-text type="strong">${config.damageProtectionPrice}</s-text>
            </s-stack>

            <s-stack direction="block" gap="small">
              <s-button variant="primary" disabled={!ready}>
                {ready
                  ? config.buttonLabelReady || "Add hire to cart"
                  : config.buttonLabelPending || "Select dates first"}
              </s-button>
              <s-text tone="neutral" color="subdued">
                Button switches when dates are selected
              </s-text>
            </s-stack>
          </s-stack>
        </s-box>
      </s-stack>
    </s-box>
  );
}

export default function SettingsPage() {
  const { config: loaderConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showSaved, setShowSaved] = useState(false);
  const [draft, setDraft] = useState<WidgetConfig>(loaderConfig);

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

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  return (
    <s-page heading="Storefront text" inlineSize="large">
      {showSaved ? (
        <s-banner tone="success" dismissible onDismiss={() => setShowSaved(false)}>
          {actionData?.reset
            ? "All text reset to defaults. Refresh your storefront to see changes."
            : "Text saved successfully. Refresh your storefront to see changes."}
        </s-banner>
      ) : null}

      <s-box padding="base" background="subdued" borderRadius="large">
        <s-stack direction="inline" gap="base" alignItems="start">
          <s-icon type="info" />
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">Edit customer-facing copy in one place</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Type your messages below. Each field maps directly to the booking
              widget on your product pages — no theme code needed.
            </s-paragraph>
          </s-stack>
        </s-stack>
      </s-box>

      <Form method="post">
        <input type="hidden" name="intent" value="save" />

        <s-stack direction="block" gap="large">
          <SectionCard
            step="Step 1"
            title="Delivery buttons"
            description="Short labels for how customers receive their hire."
          >
            <s-grid gridTemplateColumns="1fr 1fr" gap="large">
              <s-text-field
                label="Postage button text"
                name="postLabel"
                value={draft.postLabel}
                placeholder="Post"
                icon="delivery"
                onChange={(event) =>
                  updateDraft("postLabel", event.currentTarget.value)
                }
                details='The label on the postage option, e.g. "Post" or "Nationwide delivery"'
              />
              <s-text-field
                label="Local pickup button text"
                name="pickupLabel"
                value={draft.pickupLabel}
                placeholder="Local Pickup (Gold Coast, QLD)"
                icon="location"
                onChange={(event) =>
                  updateDraft("pickupLabel", event.currentTarget.value)
                }
                details="Include your city or suburb so customers know where to collect"
              />
            </s-grid>
          </SectionCard>

          <SectionCard
            step="Step 2"
            title="Helpful messages"
            description="Longer guidance shown around the booking calendar."
          >
            <s-stack direction="block" gap="large">
              <s-stack direction="block" gap="small">
                <s-text-area
                  label="Delivery instructions"
                  name="deliveryInstructions"
                  value={draft.deliveryInstructions}
                  placeholder="Select a delivery date 1–2 days before your event…"
                  rows={5}
                  onChange={(event) =>
                    updateDraft(
                      "deliveryInstructions",
                      event.currentTarget.value,
                    )
                  }
                  details="Shown below delivery buttons, above the calendar"
                />
                <CharCount value={draft.deliveryInstructions} />
              </s-stack>

              <s-stack direction="block" gap="small">
                <s-text-area
                  label="Postage note"
                  name="postageNote"
                  value={draft.postageNote}
                  placeholder="Nationwide postage is $12.50–18.50 and will be added at checkout…"
                  rows={4}
                  onChange={(event) =>
                    updateDraft("postageNote", event.currentTarget.value)
                  }
                  details="Shown below the calendar when Post is selected"
                />
                <CharCount value={draft.postageNote} />
              </s-stack>
            </s-stack>
          </SectionCard>

          <SectionCard
            step="Step 3"
            title="Add to cart button"
            description="The main button text changes depending on whether dates are selected."
          >
            <s-grid gridTemplateColumns="1fr 1fr" gap="large">
              <s-text-field
                label="Before dates are selected"
                name="buttonLabelPending"
                value={draft.buttonLabelPending}
                placeholder="Select dates first"
                onChange={(event) =>
                  updateDraft("buttonLabelPending", event.currentTarget.value)
                }
              />
              <s-text-field
                label="When ready to add to cart"
                name="buttonLabelReady"
                value={draft.buttonLabelReady}
                placeholder="Add hire to cart"
                onChange={(event) =>
                  updateDraft("buttonLabelReady", event.currentTarget.value)
                }
              />
            </s-grid>
          </SectionCard>

          <SectionCard
            step="Step 4"
            title="Damage protection"
            description="Optional add-on shown during booking. Pick a product from your store."
          >
            <s-stack direction="block" gap="large">
              <input
                type="hidden"
                name="damageProtectionVariantId"
                value={draft.damageProtectionVariantId}
              />
              <input
                type="hidden"
                name="damageProtectionProductTitle"
                value={draft.damageProtectionProductTitle}
              />

              <DamageProtectionProductPicker
                productTitle={draft.damageProtectionProductTitle}
                variantId={draft.damageProtectionVariantId}
                onSelect={({ productTitle, variantId, displayPrice }) => {
                  setDraft((current) => ({
                    ...current,
                    damageProtectionProductTitle: productTitle,
                    damageProtectionVariantId: variantId,
                    damageProtectionPrice:
                      displayPrice || current.damageProtectionPrice,
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
                  name="damageProtectionLabel"
                  value={draft.damageProtectionLabel}
                  placeholder="Add Damage Protection"
                  onChange={(event) =>
                    updateDraft(
                      "damageProtectionLabel",
                      event.currentTarget.value,
                    )
                  }
                />
                <s-text-field
                  label="More info link text"
                  name="moreInfoLabel"
                  value={draft.moreInfoLabel}
                  placeholder="More Info"
                  onChange={(event) =>
                    updateDraft("moreInfoLabel", event.currentTarget.value)
                  }
                />
                <s-text-field
                  label="Display price"
                  name="damageProtectionPrice"
                  value={draft.damageProtectionPrice}
                  placeholder="19.95"
                  onChange={(event) =>
                    updateDraft(
                      "damageProtectionPrice",
                      event.currentTarget.value,
                    )
                  }
                  details="Auto-filled from the product price when you choose a product"
                />
              </s-grid>

              <s-url-field
                label="More info page URL"
                name="damageProtectionMoreInfoUrl"
                value={draft.damageProtectionMoreInfoUrl}
                placeholder="https://yourstore.com/pages/damage-protection"
                onChange={(event) =>
                  updateDraft(
                    "damageProtectionMoreInfoUrl",
                    event.currentTarget.value,
                  )
                }
                details="Optional — opens when customers click More Info"
              />

              {!draft.damageProtectionVariantId ? (
                <s-banner tone="warning">
                  Choose a damage protection product so customers can add it at
                  checkout.
                </s-banner>
              ) : (
                <s-banner tone="success">
                  {draft.damageProtectionProductTitle
                    ? `${draft.damageProtectionProductTitle} is connected.`
                    : "Damage protection is configured."}
                </s-banner>
              )}
            </s-stack>
          </SectionCard>

          <s-box
            padding="large"
            background="base"
            border="base"
            borderRadius="large"
          >
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button
                type="submit"
                variant="primary"
                icon="save"
                {...(isSaving ? { loading: true } : {})}
              >
                Save all text
              </s-button>
              {isDirty ? (
                <s-badge tone="warning">Unsaved changes</s-badge>
              ) : (
                <s-badge tone="success">All saved</s-badge>
              )}
            </s-stack>
          </s-box>
        </s-stack>
      </Form>

      <Form method="post">
        <s-box padding="base" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="base" alignItems="center">
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

      <s-section slot="aside" heading="Preview">
        <WidgetPreview config={draft} />
      </s-section>

      <s-section slot="aside" heading="Tips">
        <s-stack direction="block" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Keep messages short</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Customers read these on mobile. Two or three sentences work best.
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Damage protection product</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Create an &quot;Accidental Damage protection&quot; product in
                Shopify, then use Choose product above to connect it in one
                click.
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Theme block heading</s-text>
              <s-paragraph tone="neutral" color="subdued">
                The widget title (e.g. &quot;Book this gown&quot;) is edited in
                Online Store → Themes → Customize.
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
