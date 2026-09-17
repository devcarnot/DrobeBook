import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  CONFIG_STATUS_LABELS,
  CONFIG_STATUS_TONES,
} from "../lib/rental-product/rental-product.types";
import { deriveConfigStatus } from "../lib/rental-product/rental-product-status";
import {
  getRentalProductForConfigure,
  saveRentalProductConfiguration,
} from "../lib/rental-product/rental-product.server";
import { shopifyAdminProductUrl } from "../lib/shopify-ids";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rentalProductId = url.searchParams.get("id");

  if (!rentalProductId) {
    throw new Response("Product not found", { status: 404 });
  }

  const product = await getRentalProductForConfigure(session.shop, rentalProductId);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const configStatus = deriveConfigStatus({
    removedAt: product.removedAt,
    syncError: product.syncError,
    shopifyStatus: product.shopifyStatus,
    shopifyAvailable: product.shopifyAvailable,
    isConfigured: product.isConfigured,
    rentalEnabled: product.rentalEnabled,
  });

  return {
    product,
    configStatus,
    shopifyAdminUrl: shopifyAdminProductUrl(session.shop, product.shopifyProductId),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const rentalProductId = String(formData.get("rentalProductId") ?? "");
  const rentalEnabled = formData.get("rentalEnabled") === "true";

  const result = await saveRentalProductConfiguration(session.shop, rentalProductId, {
    rentalEnabled,
    markConfigured: true,
  });

  return result;
};

export default function ConfigureProductPage() {
  const { product, configStatus, shopifyAdminUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [rentalEnabled, setRentalEnabled] = useState(product.rentalEnabled);
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setRentalEnabled(product.rentalEnabled);
  }, [product.rentalEnabled]);

  const firstVariant = product.variants.find((variant) => variant.availableInShopify);

  return (
    <s-page heading="Configure Product" inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/products">
        Products
      </s-link>

      <s-stack direction="block" gap="large">
        {actionData?.message ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
        ) : null}

        <s-box padding="large" background="base" border="base" borderRadius="large">
          <s-stack direction="block" gap="large">
            <s-stack direction="inline" gap="large" alignItems="start">
              {product.featuredImageUrl ? (
                <img
                  src={product.featuredImageUrl}
                  alt={product.title}
                  style={{
                    width: "120px",
                    height: "120px",
                    objectFit: "cover",
                    borderRadius: "12px",
                  }}
                />
              ) : null}
              <s-stack direction="block" gap="small">
                <s-text type="strong">{product.title}</s-text>
                <s-badge tone={CONFIG_STATUS_TONES[configStatus]}>
                  {CONFIG_STATUS_LABELS[configStatus]}
                </s-badge>
                <s-text tone="neutral" color="subdued">
                  {product.vendor ?? "No vendor"} · {product.shopifyStatus}
                </s-text>
              </s-stack>
            </s-stack>

            <s-paragraph tone="neutral" color="subdued">
              Imported products start in setup mode. Enable rentals when this product is ready,
              then review variant availability and booking settings.
            </s-paragraph>

            <Form method="post">
              <input type="hidden" name="rentalProductId" value={product.id} />
              <input type="hidden" name="rentalEnabled" value={rentalEnabled ? "true" : "false"} />
              <s-stack direction="block" gap="large">
                <label style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={rentalEnabled}
                    onChange={(event) => setRentalEnabled(event.currentTarget.checked)}
                  />
                  <span>Enable rentals for this product</span>
                </label>
                <s-stack direction="inline" gap="small">
                  <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>
                    Save configuration
                  </s-button>
                  {firstVariant ? (
                    <Link
                      to={`/app/inventory/detail?productId=${product.shopifyProductId}&variantId=${firstVariant.shopifyVariantId}`}
                    >
                      <s-button>Open variant calendar</s-button>
                    </Link>
                  ) : null}
                  <a href={shopifyAdminUrl} target="_blank" rel="noreferrer">
                    <s-button>View in Shopify</s-button>
                  </a>
                  <Link to="/app/products">
                    <s-button>Back to Products</s-button>
                  </Link>
                </s-stack>
              </s-stack>
            </Form>
          </s-stack>
        </s-box>

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Variants</s-text>
            {product.variants.map((variant) => (
              <s-text key={variant.id} tone="neutral">
                {variant.title}
                {variant.sku ? ` · SKU ${variant.sku}` : ""}
                {variant.price ? ` · ${variant.price}` : ""}
                {!variant.availableInShopify ? " · Unavailable in Shopify" : ""}
              </s-text>
            ))}
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
