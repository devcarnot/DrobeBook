import { useAppBridge } from "@shopify/app-bridge-react";
import { useState } from "react";

import { normalizeVariantId } from "../lib/shop-settings";

type PickedProduct = {
  id?: string;
  handle?: string;
  title?: string;
  variants?: Array<{ id?: string; price?: string }>;
};

function extractVariantId(product: PickedProduct): string {
  const variantGid = product.variants?.[0]?.id ?? "";
  return normalizeVariantId(variantGid);
}

function formatPickerPrice(price?: string): string {
  if (!price) return "";
  const amount = Number(price);
  if (Number.isNaN(amount)) return price;
  return amount.toFixed(2);
}

export function DamageProtectionProductPicker({
  productTitle,
  variantId,
  onSelect,
  onClear,
  heading = "Protection product",
  description = "Choose the Accidental Damage protection product from your Shopify catalog. It is offered as an optional add-on during gown booking.",
  connectedDescription = "Optional add-on linked to the gown hire booking widget.",
  emptyDescription = "No product selected yet. Search your store and pick the protection product — no variant ID needed.",
  chooseLabel = "Choose product",
  fallbackTitle = "Protection product",
}: {
  productTitle: string;
  variantId: string;
  onSelect: (selection: {
    productTitle: string;
    variantId: string;
    displayPrice: string;
  }) => void;
  onClear: () => void;
  heading?: string;
  description?: string;
  connectedDescription?: string;
  emptyDescription?: string;
  chooseLabel?: string;
  fallbackTitle?: string;
}) {
  const shopify = useAppBridge();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function openProductPicker() {
    setErrorMessage(null);
    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: false,
      filter: {
        variants: true,
        draft: false,
        archived: false,
      },
    });

    if (!selected?.length) {
      return;
    }

    const product = selected[0] as PickedProduct;
    const nextVariantId = extractVariantId(product);

    if (!nextVariantId) {
      setErrorMessage(
        "That product has no variant. Choose a product with at least one variant.",
      );
      return;
    }

    onSelect({
      productTitle: product.title ?? "Selected product",
      variantId: nextVariantId,
      displayPrice: formatPickerPrice(product.variants?.[0]?.price),
    });
  }

  return (
    <s-stack direction="block" gap="base">
      {errorMessage ? (
        <s-banner tone="critical">{errorMessage}</s-banner>
      ) : null}
      <s-text type="strong">{heading}</s-text>
      <s-paragraph tone="neutral" color="subdued">{description}</s-paragraph>

      {variantId ? (
        <s-box
          padding="base"
          background="subdued"
          borderRadius="base"
          border="base"
        >
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone="success">Connected</s-badge>
              <s-text type="strong">
                {productTitle || fallbackTitle}
              </s-text>
            </s-stack>
            <s-paragraph tone="neutral" color="subdued">{connectedDescription}</s-paragraph>
            <s-stack direction="inline" gap="small">
              <s-button
                type="button"
                variant="secondary"
                onClick={openProductPicker}
              >
                Change product
              </s-button>
              <s-button
                type="button"
                variant="tertiary"
                tone="critical"
                onClick={onClear}
              >
                Remove
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ) : (
        <s-box
          padding="large"
          background="subdued"
          borderRadius="base"
          border="base"
        >
          <s-stack direction="block" gap="base" alignItems="start">
            <s-paragraph tone="neutral" color="subdued">{emptyDescription}</s-paragraph>
            <s-button
              type="button"
              variant="primary"
              icon="product"
              onClick={openProductPicker}
            >
              {chooseLabel}
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}
