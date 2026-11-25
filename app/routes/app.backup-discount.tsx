import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import {
  ensureAllBackupVariantsForShop,
  getBackupVariantCoverageForShop,
} from "../lib/booking/backup-dress-variant.server";
import { BACKUP_PAY_FRACTION } from "../lib/booking/backup-dress-pricing";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const BACKUP_PERCENT = Math.round((1 - BACKUP_PAY_FRACTION) * 100);
const PAY_PERCENT = Math.round(BACKUP_PAY_FRACTION * 100);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const coverage = await getBackupVariantCoverageForShop(session.shop);
  const ready =
    coverage.variantRows > 0 && coverage.missingBackupVariant === 0;
  return { coverage, ready };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "sync-backup-variants") {
    const result = await ensureAllBackupVariantsForShop(admin, session.shop);
    const coverage = result.coverage;
    return {
      intent,
      ok: result.ok,
      productsProcessed: result.productsProcessed,
      variantsAttempted: result.variantsAttempted,
      errors: result.errors,
      coverage,
      ready: coverage.variantRows > 0 && coverage.missingBackupVariant === 0,
    };
  }

  return {
    intent: null,
    ok: false,
    productsProcessed: 0,
    errors: ["Unknown action."],
    coverage: await getBackupVariantCoverageForShop(session.shop),
    ready: false,
  };
};

export default function BackupDressDiscountPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const coverage = actionData?.coverage ?? loaderData.coverage;
  const ready = actionData?.ready ?? loaderData.ready;
  const isSyncing =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "sync-backup-variants";

  const syncErrors =
    actionData?.intent === "sync-backup-variants" ? actionData.errors ?? [] : [];

  const syncMessage =
    actionData?.intent === "sync-backup-variants"
      ? actionData.ok
        ? `Ready — ${coverage.withBackupVariant} / ${coverage.variantRows} hire variants have backup pricing in Shopify.`
        : syncErrors.length
          ? null
          : `${coverage.withBackupVariant} / ${coverage.variantRows} variants have backup pricing. ${coverage.missingBackupVariant} still missing — click Sync again or check errors below.`
      : null;

  return (
    <s-page heading="Backup dress hire discount">
      <s-section heading="Active pricing (cart & checkout)">
        <s-stack direction="block" gap="base">
          <s-banner tone="success" heading="No checkout discount setup required">
            Backup gown hires are priced at <s-text type="strong">{PAY_PERCENT}%</s-text>{" "}
            of the hire rate ({BACKUP_PERCENT}% off) using matching{" "}
            <s-text type="strong">Shopify product variants</s-text>. Cart and checkout
            totals use those variant prices automatically — you do not need Shopify Plus or
            an automatic checkout discount.
          </s-banner>

          <s-text>
            When a customer hires multiple gowns for the{" "}
            <s-text type="strong">same delivery & return period</s-text>, about half the
            lines stay at full hire price (<s-text type="strong">Main Hire</s-text>) and
            the rest use the cheaper backup variant (
            <s-text type="strong">Backup Dress · {BACKUP_PERCENT}% OFF</s-text>). The{" "}
            <s-text type="strong">GK.Drobe Cart</s-text> theme embed assigns tiers and
            swaps lines to the correct variant.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Backup variant status">
        <s-stack direction="block" gap="base">
          <s-banner tone="info" heading="How to sync">
            <s-stack direction="block" gap="small">
              <s-text>1. Open this page in Shopify admin (DrobeBook → Backup dress discount).</s-text>
              <s-text>
                2. If Shopify asks to <s-text type="strong">approve updated permissions</s-text>{" "}
                (edit products), accept — sync needs that to create backup variants.
              </s-text>
              <s-text>
                3. Click <s-text type="strong">Sync backup variants for all rental products</s-text>{" "}
                and wait until the button finishes (up to ~1 minute).
              </s-text>
              <s-text>
                4. Coverage should show{" "}
                <s-text type="strong">
                  {coverage.variantRows} / {coverage.variantRows}
                </s-text>{" "}
                (all variants). Then hard-refresh the storefront cart and test again.
              </s-text>
            </s-stack>
          </s-banner>

          <s-box padding="base" border="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Coverage</s-text>
              <s-text>
                Rental products enabled:{" "}
                <s-text type="strong">{coverage.enabledRentalProducts}</s-text>
              </s-text>
              <s-text>
                Hire variants with backup pricing:{" "}
                <s-text type="strong">
                  {coverage.withBackupVariant} / {coverage.variantRows}
                </s-text>
              </s-text>

              {coverage.variantRows === 0 ? (
                <s-banner tone="warning" heading="No rental variants yet">
                  Enable rental on products in{" "}
                  <s-link href="/app/products">Rental products</s-link>, then sync below.
                </s-banner>
              ) : ready ? (
                <s-banner tone="success" heading="Ready for storefront">
                  Every enabled hire variant has a backup-priced sibling in Shopify.
                </s-banner>
              ) : (
                <s-banner tone="warning" heading="Sync recommended">
                  {coverage.missingBackupVariant} variant
                  {coverage.missingBackupVariant === 1 ? "" : "s"} still need backup
                  pricing. Run sync — cart discounts will not apply until variants exist.
                </s-banner>
              )}
            </s-stack>
          </s-box>

          {syncMessage ? (
            <s-banner
              tone={actionData?.ok ? "success" : "critical"}
              heading={actionData?.ok ? "Sync complete" : "Sync incomplete"}
            >
              {syncMessage}
            </s-banner>
          ) : null}

          {syncErrors.length ? (
            <s-banner tone="critical" heading="Sync errors">
              <s-stack direction="block" gap="small">
                {syncErrors.map((line) => (
                  <s-text key={line}>{line}</s-text>
                ))}
              </s-stack>
            </s-banner>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="sync-backup-variants" />
            <s-button
              type="submit"
              variant="primary"
              disabled={isSyncing || coverage.enabledRentalProducts === 0}
            >
              {isSyncing
                ? "Syncing backup variants…"
                : "Sync backup variants for all rental products"}
            </s-button>
          </Form>

          <s-text tone="neutral" color="subdued">
            Sync adds a &quot;Hire pricing&quot; option on each rental product (Standard /
            Backup) and creates backup variants at {PAY_PERCENT}% of the main hire price.
            Saving rental settings on a single product also triggers sync for that product.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Storefront checklist">
        <s-stack direction="block" gap="small">
          <s-text>
            1. Theme editor → <s-text type="strong">App embeds</s-text> → enable{" "}
            <s-text type="strong">GK.Drobe Cart</s-text>.
          </s-text>
          <s-text>
            2. Run <s-text type="strong">Sync backup variants</s-text> above (once after
            deploy or when you add new rental SKUs).
          </s-text>
          <s-text>
            3. Hard-refresh the cart page after testing.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="How to test">
        <s-stack direction="block" gap="small">
          <s-text>
            1. Add <s-text type="strong">two or more gowns</s-text> with the{" "}
            <s-text type="strong">same delivery & return dates</s-text> (clutch-only lines
            do not count).
          </s-text>
          <s-text>
            2. Cart — one line shows <s-text type="strong">Main Hire</s-text> at full
            price; backup lines show the pill, strikethrough compare price, and about{" "}
            {PAY_PERCENT}% of hire.
          </s-text>
          <s-text>
            3. Checkout — totals should match the cart (backup lines use the cheaper
            variant; no extra discount code).
          </s-text>
          <s-text tone="neutral" color="subdued">
            One gown only → no backup discount. Different hire dates → priced per group.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Shortcuts">
        <s-stack direction="inline" gap="small">
          <s-button href="/app/products" variant="secondary">
            Rental products
          </s-button>
          <s-button href="/app" variant="tertiary">
            Back to dashboard
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const ErrorBoundary = boundary.error;