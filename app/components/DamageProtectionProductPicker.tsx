import { useAppBridge } from "@shopify/app-bridge-react";

import { normalizeVariantId } from "../lib/shop-settings";

type PickedProduct = {
  id?: string;
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
}: {
  productTitle: string;
  variantId: string;
  onSelect: (selection: {
    productTitle: string;
    variantId: string;
    displayPrice: string;
  }) => void;
  onClear: () => void;
}) {
  const shopify = useAppBridge();

  async function openProductPicker() {
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
      <s-text type="strong">Protection product</s-text>
      <s-paragraph tone="neutral" color="subdued">
        Choose the Accidental Damage protection product from your Shopify
        catalog. The first variant is used at checkout.
      </s-paragraph>

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
                {productTitle || "Protection product"}
              </s-text>
            </s-stack>
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
            <s-paragraph tone="neutral" color="subdued">
              No product selected yet. Search your store and pick the protection
              product — no variant ID needed.
            </s-paragraph>
            <s-button
              type="button"
              variant="primary"
              icon="product"
              onClick={openProductPicker}
            >
              Choose product
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}
