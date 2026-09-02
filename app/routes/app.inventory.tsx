import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, Link, useLoaderData, useSearchParams } from "react-router";

import {
  listGarmentsForShop,
  type GarmentListSort,
} from "../lib/garment/garment.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q");
  const sortParam = url.searchParams.get("sort");
  const sort: GarmentListSort =
    sortParam === "timesRented" ||
    sortParam === "revenue" ||
    sortParam === "profit"
      ? sortParam
      : "name";

  const garments = await listGarmentsForShop(admin, session.shop, {
    search,
    sort,
  });

  return { garments, search: search ?? "", sort };
};

function formatDisplayDate(iso: string | null) {
  if (!iso) {
    return "—";
  }
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function InventoryPage() {
  const { garments, search, sort } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  return (
    <s-page heading="Inventory & Bookings" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Garment inventory</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Track hire history, revenue, and manual reservations per gown. Online
              bookings sync automatically from Shopify orders.
            </s-paragraph>
          </s-stack>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
          <Form method="get">
            <s-grid gridTemplateColumns="2fr 1fr auto" gap="large" alignItems="end">
              <s-text-field
                label="Search garments"
                name="q"
                value={search}
                placeholder="Search by product name"
              />
              <s-select label="Sort by" name="sort" value={sort}>
                <option value="name">Name</option>
                <option value="timesRented">Times rented</option>
                <option value="revenue">Revenue</option>
                <option value="profit">Profit</option>
              </s-select>
              <s-box paddingBlockStart="large-300">
                <s-button type="submit" variant="primary">
                  Apply
                </s-button>
              </s-box>
            </s-grid>
          </Form>
        </s-box>

        <s-box padding="large" border="base" borderRadius="large" background="base">
        {garments.length === 0 ? (
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">No garments found</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Try a different search term, or wait for the first online booking
                to appear here.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Garment</s-table-header>
              <s-table-header listSlot="labeled">Size</s-table-header>
              <s-table-header listSlot="labeled">Times rented</s-table-header>
              <s-table-header listSlot="labeled">Revenue</s-table-header>
              <s-table-header listSlot="labeled">Profit</s-table-header>
              <s-table-header listSlot="secondary">Next available</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {garments.map((garment) => (
                <s-table-row key={`${garment.productId}-${garment.variantId}`}>
                  <s-table-cell>
                    <Link
                      to={`/app/inventory/detail?productId=${garment.productId}&variantId=${garment.variantId}&${searchParams.toString()}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <s-stack direction="inline" gap="base" alignItems="center">
                        {garment.imageUrl ? (
                          <img
                            src={garment.imageUrl}
                            alt=""
                            width={40}
                            height={40}
                            style={{
                              objectFit: "cover",
                              borderRadius: "4px",
                            }}
                          />
                        ) : (
                          <s-box
                            padding="small"
                            background="subdued"
                            borderRadius="base"
                          >
                            <s-text tone="neutral">—</s-text>
                          </s-box>
                        )}
                        <s-text type="strong">{garment.productTitle}</s-text>
                      </s-stack>
                    </Link>
                  </s-table-cell>
                  <s-table-cell>{garment.sizeLabel}</s-table-cell>
                  <s-table-cell>{garment.timesRented}</s-table-cell>
                  <s-table-cell>{garment.revenueLabel}</s-table-cell>
                  <s-table-cell>{garment.profitLabel}</s-table-cell>
                  <s-table-cell>
                    {formatDisplayDate(garment.nextAvailableDate)}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        </s-box>

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="block" gap="base">
            <s-text type="strong">Cost &amp; profit</s-text>
            <s-paragraph tone="neutral" color="subdued">
              Profit uses Shopify&apos;s &quot;Cost per item&quot; (
              <s-text type="strong">Inventory → unit cost</s-text>). Your staff
              account needs the &quot;View product costs&quot; permission in Shopify
              Admin — the app cannot grant this.
            </s-paragraph>
            <s-paragraph tone="neutral" color="subdued">
              Profit = total revenue − acquisition cost (once per garment). Per-rental
              cleaning costs are not subtracted yet — confirm with GK.Drobe if that
              should change.
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
