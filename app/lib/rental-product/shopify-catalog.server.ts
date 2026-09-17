import { extractNumericId } from "../shopify-ids";
import type { CatalogPage, ShopifyCatalogProduct } from "./rental-product.types";
import { buildCatalogSearchQuery } from "./rental-product-status";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const CATALOG_PRODUCTS_QUERY = `#graphql
  query RentalImportCatalog($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        featuredImage {
          url
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `#graphql
  query RentalImportProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      vendor
      productType
      featuredImage {
        url
      }
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          inventoryItem {
            id
          }
        }
      }
    }
  }
`;

function mapCatalogProduct(node: {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor?: string | null;
  productType?: string | null;
  featuredImage?: { url?: string | null } | null;
  variants?: {
    nodes?: Array<{
      id: string;
      title: string;
      sku?: string | null;
      price?: string | null;
      inventoryQuantity?: number | null;
      inventoryItem?: { id?: string | null } | null;
    }> | null;
  } | null;
}): ShopifyCatalogProduct {
  return {
    shopifyProductId: extractNumericId(node.id),
    title: node.title,
    handle: node.handle,
    featuredImageUrl: node.featuredImage?.url ?? null,
    shopifyStatus: node.status,
    vendor: node.vendor ?? null,
    productType: node.productType ?? null,
    variants: (node.variants?.nodes ?? []).map((variant) => ({
      shopifyVariantId: extractNumericId(variant.id),
      title: variant.title,
      sku: variant.sku ?? null,
      price: variant.price ?? null,
      inventoryItemId: variant.inventoryItem?.id
        ? extractNumericId(variant.inventoryItem.id)
        : null,
      inventoryQuantity:
        typeof variant.inventoryQuantity === "number"
          ? variant.inventoryQuantity
          : null,
    })),
  };
}

async function graphqlWithRetry(
  admin: AdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<Response> {
  const response = await admin.graphql(query, { variables });

  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return graphqlWithRetry(admin, query, variables, attempt + 1);
  }

  return response;
}

export async function fetchShopifyCatalogPage(
  admin: AdminGraphqlClient,
  params: {
    first?: number;
    after?: string | null;
    search?: string | null;
    status?: string | null;
    vendor?: string | null;
    productType?: string | null;
  },
): Promise<CatalogPage> {
  const query = buildCatalogSearchQuery(params);
  const response = await graphqlWithRetry(admin, CATALOG_PRODUCTS_QUERY, {
    first: params.first ?? 20,
    after: params.after ?? null,
    query,
  });

  if (!response.ok) {
    throw new Error(`Shopify catalog request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      products?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: Array<Parameters<typeof mapCatalogProduct>[0]>;
      };
    };
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Shopify catalog query failed");
  }

  const connection = json.data?.products;

  return {
    products: (connection?.nodes ?? []).map(mapCatalogProduct),
    pageInfo: {
      hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
      endCursor: connection?.pageInfo?.endCursor ?? null,
    },
  };
}

export async function fetchShopifyProductById(
  admin: AdminGraphqlClient,
  shopifyProductId: string,
): Promise<ShopifyCatalogProduct | null> {
  const gid = shopifyProductId.startsWith("gid://")
    ? shopifyProductId
    : `gid://shopify/Product/${shopifyProductId}`;

  const response = await graphqlWithRetry(admin, PRODUCT_BY_ID_QUERY, { id: gid });
  const json = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: { product?: Parameters<typeof mapCatalogProduct>[0] | null };
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "Shopify product query failed");
  }

  if (!json.data?.product) {
    return null;
  }

  return mapCatalogProduct(json.data.product);
}

export async function fetchShopifyCatalogFilters(
  admin: AdminGraphqlClient,
): Promise<{ vendors: string[]; productTypes: string[] }> {
  const page = await fetchShopifyCatalogPage(admin, { first: 50 });
  const vendors = new Set<string>();
  const productTypes = new Set<string>();

  for (const product of page.products) {
    if (product.vendor) vendors.add(product.vendor);
    if (product.productType) productTypes.add(product.productType);
  }

  return {
    vendors: [...vendors].sort((a, b) => a.localeCompare(b)),
    productTypes: [...productTypes].sort((a, b) => a.localeCompare(b)),
  };
}
