import { useAppBridge } from "@shopify/app-bridge-react";
import { useMemo, useState } from "react";

import { extractNumericId } from "../lib/shopify-ids";

type PickedVariant = {
  id?: string;
  title?: string;
  sku?: string;
  price?: string;
  image?: { url?: string | null } | null;
};

type PickedProduct = {
  id?: string;
  title?: string;
  featuredImage?: { url?: string | null } | null;
  images?: Array<{ url?: string | null }>;
  variants?: PickedVariant[];
};

export type SelectedRentalProduct = {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  imageUrl: string | null;
  sku: string | null;
};

function mapPickedProduct(product: PickedProduct, variantId?: string): SelectedRentalProduct | null {
  const productId = product.id ? extractNumericId(product.id) : "";
  const variants = product.variants ?? [];

  if (!productId || variants.length === 0) {
    return null;
  }

  const variant =
    variants.find((item) => item.id && extractNumericId(item.id) === variantId) ??
    variants[0];

  if (!variant?.id) {
    return null;
  }

  const imageUrl =
    variant.image?.url ??
    product.featuredImage?.url ??
    product.images?.[0]?.url ??
    null;

  return {
    productId,
    variantId: extractNumericId(variant.id),
    productTitle: product.title ?? "Selected product",
    variantTitle: variant.title ?? "Default",
    imageUrl,
    sku: variant.sku ?? null,
  };
}

export function RentalProductPicker({
  selection,
  onSelect,
  onClear,
  selectLabel = "Select Products",
  emptyText = "No products selected yet.",
}: {
  selection: SelectedRentalProduct | null;
  onSelect: (selection: SelectedRentalProduct) => void;
  onClear: () => void;
  selectLabel?: string;
  emptyText?: string;
}) {
  const shopify = useAppBridge();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<PickedProduct | null>(null);
  const [pendingVariantId, setPendingVariantId] = useState("");

  const pendingVariants = useMemo(() => pendingProduct?.variants ?? [], [pendingProduct]);

  async function openProductPicker() {
    setErrorMessage(null);

    const selected = await shopify.resourcePicker({
      type: "product",
      multiple: false,
      filter: {
        variants: true,
        draft: true,
        archived: false,
      },
    });

    if (!selected?.length) {
      return;
    }

    const product = selected[0] as PickedProduct;
    const variants = product.variants ?? [];

    if (variants.length === 0) {
      setErrorMessage("That product has no variants. Choose another product.");
      return;
    }

    if (variants.length === 1) {
      const mapped = mapPickedProduct(product);
      if (!mapped) {
        setErrorMessage("Could not read the selected product.");
        return;
      }
      setPendingProduct(null);
      setPendingVariantId("");
      onSelect(mapped);
      return;
    }

    setPendingProduct(product);
    setPendingVariantId(variants[0]?.id ? extractNumericId(variants[0].id) : "");
  }

  function confirmVariant() {
    if (!pendingProduct || !pendingVariantId) {
      return;
    }

    const mapped = mapPickedProduct(pendingProduct, pendingVariantId);
    if (!mapped) {
      setErrorMessage("Could not read the selected variant.");
      return;
    }

    setPendingProduct(null);
    setPendingVariantId("");
    onSelect(mapped);
  }

  function cancelVariantPick() {
    setPendingProduct(null);
    setPendingVariantId("");
  }

  return (
    <s-stack direction="block" gap="base">
      {errorMessage ? <s-banner tone="critical">{errorMessage}</s-banner> : null}

      {selection ? (
        <s-box padding="base" background="subdued" border="base" borderRadius="base">
          <s-stack direction="inline" gap="base" alignItems="start">
            {selection.imageUrl ? (
              <img
                src={selection.imageUrl}
                alt={selection.productTitle}
                style={{
                  width: "56px",
                  height: "56px",
                  objectFit: "cover",
                  borderRadius: "8px",
                  background: "#f4f4f4",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "8px",
                  background: "#f4f4f4",
                }}
              />
            )}
            <s-stack direction="block" gap="small">
              <s-text type="strong">{selection.productTitle}</s-text>
              <s-text tone="neutral" color="subdued">
                {selection.variantTitle}
                {selection.sku ? ` · SKU ${selection.sku}` : ""}
              </s-text>
              <s-stack direction="inline" gap="small">
                <s-button type="button" variant="secondary" onClick={openProductPicker}>
                  Change product
                </s-button>
                <s-button type="button" variant="tertiary" tone="critical" onClick={onClear}>
                  Clear
                </s-button>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-box>
      ) : pendingProduct ? (
        <s-box padding="base" background="subdued" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text type="strong">{pendingProduct.title ?? "Selected product"}</s-text>
            <s-select
              label="Variant"
              value={pendingVariantId}
              onChange={(event) =>
                setPendingVariantId(
                  event.currentTarget?.value ??
                    (event.target as HTMLSelectElement | null)?.value ??
                    "",
                )
              }
            >
              {pendingVariants.map((variant) => (
                <s-option
                  key={variant.id}
                  value={variant.id ? extractNumericId(variant.id) : ""}
                >
                  {variant.title}
                  {variant.sku ? ` · ${variant.sku}` : ""}
                </s-option>
              ))}
            </s-select>
            <s-stack direction="inline" gap="small">
              <s-button type="button" variant="primary" onClick={confirmVariant}>
                Select
              </s-button>
              <s-button type="button" onClick={cancelVariantPick}>
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ) : (
        <s-box padding="large" background="subdued" border="base" borderRadius="base">
          <s-stack direction="block" gap="base" alignItems="start">
            <s-text tone="neutral" color="subdued">
              {emptyText}
            </s-text>
            <s-button type="button" variant="primary" icon="product" onClick={openProductPicker}>
              {selectLabel}
            </s-button>
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}

export async function pickRentalProductFromShopify(
  shopify: ReturnType<typeof useAppBridge>,
): Promise<SelectedRentalProduct | null> {
  const selected = await shopify.resourcePicker({
    type: "product",
    multiple: false,
    filter: {
      variants: true,
      draft: true,
      archived: false,
    },
  });

  if (!selected?.length) {
    return null;
  }

  const product = selected[0] as PickedProduct;
  return mapPickedProduct(product);
}
