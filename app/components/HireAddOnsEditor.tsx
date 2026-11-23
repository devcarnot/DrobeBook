import { useAppBridge } from "@shopify/app-bridge-react";
import { useState } from "react";

import {
  MAX_HIRE_ADDONS,
  type HireAddOn,
} from "../lib/hire-add-ons";
import { normalizeVariantId } from "../lib/shop-settings";

type PickedProduct = {
  id?: string;
  title?: string;
  featuredImage?: { url?: string };
  images?: Array<{ originalSrc?: string; url?: string }>;
  variants?: Array<{ id?: string; price?: string }>;
};

function normalizeProductId(value: string): string {
  const trimmed = value.trim();
  const gidMatch = trimmed.match(/Product\/(\d+)/i);
  if (gidMatch) {
    return gidMatch[1];
  }
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function formatPickerPrice(price?: string): string {
  if (!price) return "";
  const amount = Number(price);
  if (Number.isNaN(amount)) return price;
  return amount.toFixed(2);
}

function imageFromProduct(product: PickedProduct): string {
  return (
    product.featuredImage?.url ||
    product.images?.[0]?.originalSrc ||
    product.images?.[0]?.url ||
    ""
  );
}

function nextAddOnId(addOns: HireAddOn[]): string {
  return `addon-${addOns.length + 1}`;
}

type HireAddOnsEditorProps = {
  heading: string;
  addOns: HireAddOn[];
  onHeadingChange: (heading: string) => void;
  onChange: (addOns: HireAddOn[]) => void;
};

export function HireAddOnsEditor({
  heading,
  addOns,
  onHeadingChange,
  onChange,
}: HireAddOnsEditorProps) {
  const shopify = useAppBridge();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function addProduct() {
    if (addOns.length >= MAX_HIRE_ADDONS) {
      setErrorMessage(`You can add up to ${MAX_HIRE_ADDONS} products.`);
      return;
    }

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
    const variantId = normalizeVariantId(product.variants?.[0]?.id ?? "");

    if (!variantId) {
      setErrorMessage(
        "That product has no variant. Choose a product with at least one variant.",
      );
      return;
    }

    if (addOns.some((entry) => entry.variantId === variantId)) {
      setErrorMessage("That product is already in the add-on list.");
      return;
    }

    onChange([
      ...addOns,
      {
        id: nextAddOnId(addOns),
        productId: normalizeProductId(product.id ?? ""),
        variantId,
        title: product.title ?? "Add-on product",
        imageUrl: imageFromProduct(product),
        displayPrice: formatPickerPrice(product.variants?.[0]?.price),
      },
    ]);
  }

  function removeAddOn(index: number) {
    onChange(addOns.filter((_, addOnIndex) => addOnIndex !== index));
  }

  return (
    <s-stack direction="block" gap="large">
      {errorMessage ? (
        <s-banner tone="critical">{errorMessage}</s-banner>
      ) : null}

      <s-text-field
        label="Section heading on storefront"
        value={heading}
        placeholder="Need Fashion Tape"
        onChange={(event) => onHeadingChange(event.currentTarget.value)}
      />

      <s-paragraph tone="neutral" color="subdued">
        Customers can tick these products to add them to cart with the hire. Maximum{" "}
        {MAX_HIRE_ADDONS} products.
      </s-paragraph>

      {addOns.length ? (
        <s-stack direction="block" gap="base">
          {addOns.map((addOn, index) => (
            <s-box
              key={`${addOn.id}-${addOn.variantId}`}
              padding="base"
              background="subdued"
              borderRadius="base"
            >
              <s-stack direction="block" gap="small">
                <s-text type="strong">{addOn.title}</s-text>
                {addOn.displayPrice ? (
                  <s-text tone="neutral">${addOn.displayPrice}</s-text>
                ) : null}
                <s-button
                  type="button"
                  variant="tertiary"
                  tone="critical"
                  onClick={() => removeAddOn(index)}
                >
                  Remove product
                </s-button>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      ) : (
        <s-paragraph tone="neutral" color="subdued">
          No add-on products yet. The section stays hidden on the storefront until you add
          at least one product.
        </s-paragraph>
      )}

      <s-button
        type="button"
        variant="secondary"
        icon="product"
        disabled={addOns.length >= MAX_HIRE_ADDONS}
        onClick={addProduct}
      >
        {addOns.length ? "Add another product" : "Choose product"}
      </s-button>
    </s-stack>
  );
}