import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const flags = await prisma.backupOrderFlag.findMany({
    where: { shop: session.shop, status: "open" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { flags };
};

export default function BackupFlaggedOrdersPage() {
  const { flags } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Flagged backup orders">
      <s-section heading="Open flags">
        {flags.length === 0 ? (
          <s-banner tone="success" heading="No open violations">
            Orders matched the backup dress pricing rules.
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">
            {flags.map((flag) => {
              let details: Array<{ reason?: string; variantId?: string }> = [];
              try {
                details = JSON.parse(flag.detailJson) as typeof details;
              } catch {
                details = [];
              }
              return (
                <s-box key={flag.id} padding="base" border="base" borderRadius="base">
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">
                      Order {flag.orderName ?? flag.shopifyOrderId}
                    </s-text>
                    <s-text tone="neutral" color="subdued">
                      Tagged BACKUP-VIOLATION in Shopify when detected.
                    </s-text>
                    {details.map((row, index) => (
                      <s-text key={`${flag.id}-${index}`}>
                        {row.variantId}: {row.reason}
                      </s-text>
                    ))}
                    <s-button
                      href={`https://admin.shopify.com/store/${flag.shop.replace(
                        ".myshopify.com",
                        "",
                      )}/orders/${flag.shopifyOrderId}`}
                      variant="tertiary"
                      target="_blank"
                    >
                      Open in Shopify
                    </s-button>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>
      <s-button href="/app/backup-discount" variant="secondary">
        Back to backup discount
      </s-button>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
export const ErrorBoundary = boundary.error;