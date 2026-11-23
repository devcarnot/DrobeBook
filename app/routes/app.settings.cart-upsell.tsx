import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { ClutchCollectionPicker } from "../components/ClutchCollectionPicker";
import { SettingsFeatureNav } from "../components/SettingsFeatureNav";
import {
  DEFAULT_CLUTCH_UPSELL_CONFIG,
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

  return (
    <s-page heading="Cart checkout upsell">
      <SettingsFeatureNav active="cart" />

      <s-section heading="Add a clutch">
        <s-paragraph tone="neutral" color="subdued">
          Show a pop-up on the cart page when customers tap checkout. Only clutches
          available for the same hire dates as the gown in cart are listed.
        </s-paragraph>

        <Form method="post">
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

            <s-text-field
              label="Pop-up title"
              value={draft.modalTitle}
              onChange={(event) => updateDraft("modalTitle", event.currentTarget.value)}
            />
            <s-text-field
              label="Pop-up subtitle"
              value={draft.modalSubtitle}
              onChange={(event) => updateDraft("modalSubtitle", event.currentTarget.value)}
            />

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
              onChange={(event) => updateDraft("addToCartLabel", event.currentTarget.value)}
            />
            <s-text-field
              label="Continue to checkout (after add)"
              value={draft.continueCheckoutLabel}
              onChange={(event) =>
                updateDraft("continueCheckoutLabel", event.currentTarget.value)
              }
            />
          </s-stack>

          <s-stack direction="inline" gap="small" alignItems="center">
            <s-button type="submit" variant="primary" disabled={!isDirty || isSaving}>
              Save cart upsell
            </s-button>
            {showSaved ? <s-badge tone="success">All saved</s-badge> : null}
            <s-button type="submit" name="intent" value="reset" variant="tertiary">
              Reset to defaults
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};