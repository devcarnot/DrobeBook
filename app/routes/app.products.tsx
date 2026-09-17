import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useOutlet,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { ImportProductsModal } from "../components/ImportProductsModal";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import {
  CONFIG_STATUS_LABELS,
  CONFIG_STATUS_TONES,
} from "../lib/rental-product/rental-product.types";
import { parseShopifyProductIds } from "../lib/rental-product/rental-product-status";
import {
  getImportedProductIdSet,
  importShopifyProducts,
  listImportedProducts,
  refreshAllImportedProducts,
  refreshImportedProduct,
  removeImportedProduct,
  type RentalProductListFilter,
  type RentalProductListSort,
} from "../lib/rental-product/rental-product.server";
import {
  fetchShopifyCatalogFilters,
  fetchShopifyCatalogPage,
} from "../lib/rental-product/shopify-catalog.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const FILTERS: Array<{ value: RentalProductListFilter; label: string }> = [
  { value: "all", label: "All products" },
  { value: "setup_required", label: "Setup required" },
  { value: "configured", label: "Configured" },
  { value: "rental_enabled", label: "Rental enabled" },
  { value: "rental_disabled", label: "Rental disabled" },
  { value: "shopify_unavailable", label: "Shopify unavailable" },
];

const SORTS: Array<{ value: RentalProductListSort; label: string }> = [
  { value: "title_asc", label: "Product title, A–Z" },
  { value: "title_desc", label: "Product title, Z–A" },
  { value: "imported_desc", label: "Recently imported" },
  { value: "updated_desc", label: "Recently updated" },
];

function parseFilter(value: string | null): RentalProductListFilter {
  return FILTERS.some((filter) => filter.value === value)
    ? (value as RentalProductListFilter)
    : "all";
}

function parseSort(value: string | null): RentalProductListSort {
  return SORTS.some((sort) => sort.value === value)
    ? (value as RentalProductListSort)
    : "title_asc";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";
  const filter = parseFilter(url.searchParams.get("filter"));
  const sort = parseSort(url.searchParams.get("sort"));
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);

  const result = await listImportedProducts(session.shop, {
    search,
    filter,
    sort,
    page: Number.isFinite(page) ? page : 1,
  });

  return {
    ...result,
    search,
    filter,
    sort,
    shop: session.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "load-import-catalog") {
    const search = String(formData.get("q") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();
    const after = String(formData.get("after") ?? "").trim() || undefined;

    try {
      const [catalog, importedIds, filters] = await Promise.all([
        fetchShopifyCatalogPage(admin, {
          first: 25,
          after,
          search: search || undefined,
          status: status || undefined,
        }),
        getImportedProductIdSet(session.shop),
        fetchShopifyCatalogFilters(admin),
      ]);

      return {
        intent: "load-import-catalog",
        ok: true,
        catalog,
        importedIds: [...importedIds],
        filters,
        errorMessage: null,
      };
    } catch (error) {
      return {
        intent: "load-import-catalog",
        ok: false,
        catalog: { products: [], pageInfo: { hasNextPage: false, endCursor: null } },
        importedIds: [],
        filters: { vendors: [], productTypes: [] },
        errorMessage:
          error instanceof Error
            ? error.message
            : "Could not connect to Shopify. Re-open the app and try again.",
      };
    }
  }

  if (intent === "import-products") {
    const productIds = parseShopifyProductIds(
      JSON.parse(String(formData.get("productIds") ?? "[]")),
    );

    if (!productIds.length) {
      return {
        intent: "import-products",
        ok: false,
        message: "Select at least one product to import.",
        summary: null,
      };
    }

    const summary = await importShopifyProducts(admin, session.shop, productIds);
    const totalSuccess = summary.imported + summary.updated;
    const message =
      summary.failed > 0
        ? `Imported ${totalSuccess} product(s). ${summary.failed} failed.`
        : `Successfully imported ${totalSuccess} product(s).`;

    return {
      intent: "import-products",
      ok: summary.failed === 0 || totalSuccess > 0,
      message,
      summary,
    };
  }

  if (intent === "refresh-all") {
    const summary = await refreshAllImportedProducts(admin, session.shop);
    return {
      ok: true,
      message: `Refreshed ${summary.refreshed} product(s). ${summary.failed} failed.`,
    };
  }

  const rentalProductId = String(formData.get("rentalProductId") ?? "");

  if (intent === "refresh-one" && rentalProductId) {
    const result = await refreshImportedProduct(admin, session.shop, rentalProductId);
    return { ok: result.ok, message: result.message };
  }

  if (intent === "remove" && rentalProductId) {
    const result = await removeImportedProduct(session.shop, rentalProductId);
    return { ok: result.ok, message: result.message };
  }

  return { ok: false, message: "Unsupported action." };
};

function ProductCard({
  product,
}: {
  product: Awaited<ReturnType<typeof listImportedProducts>>["products"][number];
}) {
  const tone = CONFIG_STATUS_TONES[product.configStatus];

  return (
    <s-box padding="large" border="base" borderRadius="large" background="base">
      <s-stack direction="block" gap="large">
        <div className="gk-grid gk-grid--product-card gk-gap-large">
          {product.featuredImageUrl ? (
            <img
              src={product.featuredImageUrl}
              alt={product.title}
              style={{
                width: "96px",
                height: "96px",
                objectFit: "cover",
                borderRadius: "12px",
                background: "#f4f4f4",
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: "96px",
                height: "96px",
                borderRadius: "12px",
                background: "#f4f4f4",
                display: "grid",
                placeItems: "center",
                color: "#8c8c8c",
                fontSize: "0.75rem",
              }}
            >
              No image
            </div>
          )}

          <s-stack direction="block" gap="small">
            <s-text type="strong">{product.title}</s-text>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone={tone}>{CONFIG_STATUS_LABELS[product.configStatus]}</s-badge>
              <s-badge tone="neutral">{product.shopifyStatus}</s-badge>
            </s-stack>
            <s-text tone="neutral" color="subdued">
              {product.vendor ?? "No vendor"} · {product.variantCount} variant
              {product.variantCount === 1 ? "" : "s"}
            </s-text>
            {product.syncError ? (
              <s-text tone="critical">{product.syncError}</s-text>
            ) : null}
            <s-text tone="neutral" color="subdued">
              Last synced{" "}
              {product.lastSyncedAt
                ? new Date(product.lastSyncedAt).toLocaleString()
                : "—"}
            </s-text>
          </s-stack>
        </div>

        <s-stack direction="inline" gap="small">
          <Link to={product.configureUrl}>
            <s-button variant="primary">Configure Product</s-button>
          </Link>
          <Link to={product.rentalsUrl}>
            <s-button>View Rentals</s-button>
          </Link>
          <Link to={product.calendarUrl}>
            <s-button>View Calendar</s-button>
          </Link>
          <a href={product.shopifyAdminUrl} target="_blank" rel="noreferrer">
            <s-button>View in Shopify</s-button>
          </a>
        </s-stack>

        <s-stack direction="inline" gap="small">
          <Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="intent" value="refresh-one" />
            <input type="hidden" name="rentalProductId" value={product.id} />
            <s-button type="submit">Refresh from Shopify</s-button>
          </Form>
          <Form
            method="post"
            style={{ display: "inline" }}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  "Remove this product from the rental app? Your Shopify product will not be deleted.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="remove" />
            <input type="hidden" name="rentalProductId" value={product.id} />
            <s-button type="submit" tone="critical">
              Remove from Rental App
            </s-button>
          </Form>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

export default function ProductsRoute() {
  const outlet = useOutlet();
  if (outlet) {
    return outlet;
  }

  return <ProductsListPage />;
}

function ProductsListPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(data.search);
  const [importOpen, setImportOpen] = useState(false);
  const [importBanner, setImportBanner] = useState<{
    tone: "success" | "warning" | "critical";
    message: string;
  } | null>(null);
  const isSubmitting = navigation.state !== "idle";

  useEffect(() => {
    setSearchInput(data.search);
  }, [data.search]);

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("import");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput === data.search) {
        return;
      }
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) {
        next.set("q", searchInput.trim());
      } else {
        next.delete("q");
      }
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, data.search, searchParams, setSearchParams]);

  const pageLinks = useMemo(() => {
    const makeUrl = (page: number) => {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(page));
      return `/app/products?${next.toString()}`;
    };
    return {
      prev: data.page > 1 ? makeUrl(data.page - 1) : null,
      next: data.page < data.totalPages ? makeUrl(data.page + 1) : null,
    };
  }, [data.page, data.totalPages, searchParams]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  const handleImported = useCallback(
    (result: { ok: boolean; message: string }) => {
      setImportOpen(false);
      setImportBanner({
        tone: result.ok ? "success" : "warning",
        message: result.message,
      });
      revalidator.revalidate();
    },
    [revalidator],
  );

  return (
    <s-page heading="Products" inlineSize="large">
      <s-button slot="primary-action" onClick={() => setImportOpen(true)}>
        Import Products
      </s-button>

      <ImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />

      <s-stack direction="block" gap="large">
        {importBanner ? (
          <s-banner
            tone={importBanner.tone}
            dismissible
            onDismiss={() => setImportBanner(null)}
          >
            {importBanner.message}
          </s-banner>
        ) : null}

        {actionData?.message ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
        ) : null}

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="center">
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" onClick={() => setImportOpen(true)}>
                Import Products
              </s-button>
              <Form method="post" style={{ display: "inline" }}>
                <input type="hidden" name="intent" value="refresh-all" />
                <s-button type="submit" {...(isSubmitting ? { loading: true } : {})}>
                  Refresh All Products
                </s-button>
              </Form>
            </s-stack>
            <s-text tone="neutral" color="subdued">
              {data.total} imported product{data.total === 1 ? "" : "s"}
            </s-text>
          </s-stack>
        </s-box>

        <ResponsiveGrid layout="3">
          <s-text-field
            label="Search"
            value={searchInput}
            placeholder="Search by title, SKU, vendor, or variant"
            onChange={(event) => setSearchInput(event.currentTarget.value)}
          />
          <s-select
            label="Filter"
            value={data.filter}
            onChange={(event) => updateParam("filter", event.currentTarget.value)}
          >
            {FILTERS.map((filter) => (
              <s-option key={filter.value} value={filter.value}>
                {filter.label}
              </s-option>
            ))}
          </s-select>
          <s-select
            label="Sort"
            value={data.sort}
            onChange={(event) => updateParam("sort", event.currentTarget.value)}
          >
            {SORTS.map((sort) => (
              <s-option key={sort.value} value={sort.value}>
                {sort.label}
              </s-option>
            ))}
          </s-select>
        </ResponsiveGrid>

        {data.search ? (
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-text tone="neutral" color="subdued">
              Showing results for &quot;{data.search}&quot;
            </s-text>
            <s-button
              onClick={() => {
                setSearchInput("");
                updateParam("q", "");
              }}
            >
              Clear Search
            </s-button>
          </s-stack>
        ) : null}

        {data.products.length === 0 ? (
          <s-box padding="large" background="base" border="base" borderRadius="large">
            <s-stack direction="block" gap="large" alignItems="center">
              <s-text type="strong">
                {data.search
                  ? "No products match your search."
                  : "No products imported yet."}
              </s-text>
              <s-paragraph tone="neutral" color="subdued">
                {data.search
                  ? "Try another search term or clear the filter."
                  : "Products must exist in Shopify before they can be imported and configured for rental."}
              </s-paragraph>
              {data.search ? (
                <s-button onClick={() => setSearchInput("")}>Clear Search</s-button>
              ) : (
                <s-button variant="primary" onClick={() => setImportOpen(true)}>
                  Import Products
                </s-button>
              )}
            </s-stack>
          </s-box>
        ) : (
          <ResponsiveGrid layout="2">
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ResponsiveGrid>
        )}

        {data.totalPages > 1 ? (
          <s-stack direction="inline" gap="large" alignItems="center">
            {pageLinks.prev ? (
              <Link to={pageLinks.prev}>
                <s-button>Previous</s-button>
              </Link>
            ) : (
              <s-button disabled>Previous</s-button>
            )}
            <s-text tone="neutral" color="subdued">
              Page {data.page} of {data.totalPages}
            </s-text>
            {pageLinks.next ? (
              <Link to={pageLinks.next}>
                <s-button>Next</s-button>
              </Link>
            ) : (
              <s-button disabled>Next</s-button>
            )}
          </s-stack>
        ) : null}
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
