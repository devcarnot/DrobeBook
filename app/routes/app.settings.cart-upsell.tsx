import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { ClutchCollectionPicker } from "../components/ClutchCollectionPicker";
import { ClutchUpsellPreview } from "../components/ClutchUpsellPreview";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { SettingsFeatureNav } from "../components/SettingsFeatureNav";
import { SettingsSplitLayout } from "../components/SettingsSplitLayout";
import {
  DEFAULT_CLUTCH_UPSELL_CONFIG,
  clutchCollectionConfigured,
  clutchUpsellConfigFromFormData,
  type ClutchUpsellConfig,
} from "../lib/cart/clutch-upsell-config";
import {
  getShopClutchUpsellConfig,
  saveShopClutchUpsellConfig,
} from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const clutchUpsell = await getShopClutchUpsellConfig(session.shop);
  return { clutchUpsell };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "reset") {
    await saveShopClutchUpsellConfig(session.shop, DEFAULT_CLUTCH_UPSELL_CONFIG);
    return { clutchUpsell: DEFAULT_CLUTCH_UPSELL_CONFIG, saved: true, reset: true };
  }

  const clutchUpsell = clutchUpsellConfigFromFormData(formData);
  await saveShopClutchUpsellConfig(session.shop, clutchUpsell);
  return { clutchUpsell, saved: true, reset: false };
};

export default function CartUpsellSettingsPage() {
  const { clutchUpsell: loaderConfig } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showSaved, setShowSaved] = useState(false);
  const [draft, setDraft] = useState<ClutchUpsellConfig>(loaderConfig);

  const clutchUpsell = actionData?.clutchUpsell ?? loaderConfig;
  const isSaving =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    setDraft(clutchUpsell);
  }, [clutchUpsell]);

  useEffect(() => {
    if (actionData?.saved) {
      setShowSaved(true);
    }
  }, [actionData]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(clutchUpsell),
    [draft, clutchUpsell],
  );

  const updateDraft = (field: keyof ClutchUpsellConfig, value: string | number | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const collectionReady = clutchCollectionConfigured(draft);

  return (
    <s-page heading="Store Front widget" inlineSize="large">
      <s-stack direction="block" gap="large">
        {showSaved ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowSaved(false)}>
            {actionData?.reset
              ? "Cart clutch upsell reset to defaults."
              : "Cart clutch upsell saved. Hard-refresh the cart page on your storefront to test checkout."}
          </s-banner>
        ) : null}

        <SettingsFeatureNav active="cart" />

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="cart" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Cart checkout upsell</s-text>
              <s-paragraph tone="neutral" color="subdued">
                When customers check out with a gown hire in cart, show clutches from your
                chosen collection that are available for the same hire dates. Enable the GK.Drobe
                Cart app embed in your theme.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <SettingsSplitLayout
          editor={
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <input
                type="hidden"
                name="clutchUpsellEnabled"
                value={draft.enabled ? "true" : "false"}
              />
              <input type="hidden" name="modalTitle" value={draft.modalTitle} />
              <input type="hidden" name="modalSubtitle" value={draft.modalSubtitle} />
              <input type="hidden" name="collectionId" value={draft.collectionId} />
              <input type="hidden" name="collectionTitle" value={draft.collectionTitle} />
              <input type="hidden" name="collectionHandle" value={draft.collectionHandle} />
              <input type="hidden" name="discountPercent" value={String(draft.discountPercent)} />
              <input type="hidden" name="skipButtonLabel" value={draft.skipButtonLabel} />
              <input
                type="hidden"
                name="continueCheckoutLabel"
                value={draft.continueCheckoutLabel}
              />
              <input type="hidden" name="addToCartLabel" value={draft.addToCartLabel} />
              <input type="hidden" name="loadingLabel" value={draft.loadingLabel} />
              <input type="hidden" name="emptyLabel" value={draft.emptyLabel} />

              <s-stack direction="block" gap="large">
                <s-box padding="large" background="base" border="base" borderRadius="large">
                  <s-stack direction="block" gap="large">
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Setup</s-text>
                      <s-paragraph tone="neutral" color="subdued">
                        Turn the upsell on, pick your clutch collection, and set how hire pricing
                        appears in the pop-up.
                      </s-paragraph>
                    </s-stack>

                    <s-checkbox
                      label="Enable clutch pop-up on cart checkout"
                      checked={draft.enabled}
                      onChange={(event) => updateDraft("enabled", event.currentTarget.checked)}
                    />

                    <ClutchCollectionPicker
                      collectionId={draft.collectionId}
                      collectionHandle={draft.collectionHandle}
                      collectionTitle={draft.collectionTitle}
                      onSelect={({ collectionId, collectionHandle, collectionTitle }) =>
                        setDraft((current) => ({
                          ...current,
                          collectionId,
                          collectionHandle,
                          collectionTitle,
                        }))
                      }
                      onClear={() =>
                        setDraft((current) => ({
                          ...current,
                          collectionId: "",
                          collectionHandle: "",
                          collectionTitle: "",
                        }))
                      }
                    />

                    <s-text-field
                      label="Display discount (%)"
                      value={String(draft.discountPercent)}
                      onChange={(event) =>
                        updateDraft(
                          "discountPercent",
                          Number.parseInt(event.currentTarget.value, 10) || 0,
                        )
                      }
                      details="Shown as a strikethrough vs discounted hire price. Set clutch variant prices in Shopify to match what you charge at checkout."
                    />

                    {draft.enabled && !collectionReady ? (
                      <s-banner tone="warning">
                        Choose a clutch collection before customers can see the checkout pop-up.
                      </s-banner>
                    ) : null}
                    {draft.enabled && collectionReady ? (
                      <s-banner tone="success">
                        {draft.collectionTitle || "Collection"} is connected for cart checkout
                        upsell.
                      </s-banner>
                    ) : null}
                  </s-stack>
                </s-box>

                <s-box padding="large" background="base" border="base" borderRadius="large">
                  <s-stack direction="block" gap="large">
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Pop-up copy & buttons</s-text>
                      <s-paragraph tone="neutral" color="subdued">
                        Wording customers see in the checkout interrupt modal on the cart page.
                      </s-paragraph>
                    </s-stack>

                    <s-text-field
                      label="Pop-up title"
                      value={draft.modalTitle}
                      onChange={(event) => updateDraft("modalTitle", event.currentTarget.value)}
                    />
                    <s-text-field
                      label="Pop-up subtitle"
                      value={draft.modalSubtitle}
                      onChange={(event) =>
                        updateDraft("modalSubtitle", event.currentTarget.value)
                      }
                    />

                    <ResponsiveGrid layout="2">
                      <s-text-field
                        label="Skip button"
                        value={draft.skipButtonLabel}
                        onChange={(event) =>
                          updateDraft("skipButtonLabel", event.currentTarget.value)
                        }
                      />
                      <s-text-field
                        label="Add to cart button"
                        value={draft.addToCartLabel}
                        onChange={(event) =>
                          updateDraft("addToCartLabel", event.currentTarget.value)
                        }
                      />
                      <s-text-field
                        label="Continue to checkout (after add)"
                        value={draft.continueCheckoutLabel}
                        onChange={(event) =>
                          updateDraft("continueCheckoutLabel", event.currentTarget.value)
                        }
                      />
                      <s-text-field
                        label="Loading message"
                        value={draft.loadingLabel}
                        onChange={(event) =>
                          updateDraft("loadingLabel", event.currentTarget.value)
                        }
                        details="Shown while clutch options are loading"
                      />
                    </ResponsiveGrid>

                    <s-text-field
                      label="Empty state message"
                      value={draft.emptyLabel}
                      onChange={(event) => updateDraft("emptyLabel", event.currentTarget.value)}
                      details="When no clutches are available for the hire dates in cart"
                    />

                    <s-divider />

                    <s-stack direction="inline" gap="large" alignItems="center">
                      <s-button
                        type="submit"
                        variant="primary"
                        icon="save"
                        accessibilityLabel="Save cart clutch upsell"
                        disabled={!isDirty}
                        {...(isSaving ? { loading: true } : {})}
                      >
                        Save cart upsell
                      </s-button>
                      {isDirty ? (
                        <s-badge tone="warning">Unsaved changes</s-badge>
                      ) : (
                        <s-badge tone="success">All saved</s-badge>
                      )}
                    </s-stack>
                  </s-stack>
                </s-box>
              </s-stack>
            </Form>
          }
          preview={<ClutchUpsellPreview config={draft} />}
        />

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
                Reset cart upsell to defaults
              </s-button>
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