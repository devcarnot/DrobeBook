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
import {
  getShopBackupDressDiscountConfig,
  saveShopBackupDressDiscountConfig,
} from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const BACKUP_PERCENT = Math.round((1 - BACKUP_PAY_FRACTION) * 100);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const coverage = await getBackupVariantCoverageForShop(session.shop);
  const discountConfig = await getShopBackupDressDiscountConfig(session.shop);
  const ready =
    coverage.variantRows > 0 && coverage.missingBackupVariant === 0;
  return { coverage, ready, discountEnabled: discountConfig.enabled };
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
      discountEnabled: (await getShopBackupDressDiscountConfig(session.shop)).enabled,
    };
  }

  if (intent === "set-backup-discount-enabled") {
    const enabled = formData.get("enabled") === "true";
    await saveShopBackupDressDiscountConfig(session.shop, { enabled });
    const coverage = await getBackupVariantCoverageForShop(session.shop);
    return {
      intent,
      ok: true,
      productsProcessed: 0,
      variantsAttempted: 0,
      errors: [] as string[],
      coverage,
      ready: coverage.variantRows > 0 && coverage.missingBackupVariant === 0,
      discountEnabled: enabled,
    };
  }

  return {
    intent: null,
    ok: false,
    productsProcessed: 0,
    errors: ["Unknown action."],
    coverage: await getBackupVariantCoverageForShop(session.shop),
    ready: false,
    discountEnabled: (await getShopBackupDressDiscountConfig(session.shop)).enabled,
  };
};

export default function BackupDressDiscountPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const coverage = actionData?.coverage ?? loaderData.coverage;
  const ready = actionData?.ready ?? loaderData.ready;
  const discountEnabled = actionData?.discountEnabled ?? loaderData.discountEnabled;
  const isSyncing =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "sync-backup-variants";
  const isSavingDiscount =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "set-backup-discount-enabled";

  const syncErrors =
    actionData?.intent === "sync-backup-variants" ? actionData.errors ?? [] : [];

  const storeLive = discountEnabled && ready;
  const statusTone = storeLive ? "success" : !discountEnabled ? "neutral" : "warning";
  const statusLabel = storeLive
    ? "Live on storefront"
    : !discountEnabled
      ? "Off"
      : coverage.variantRows === 0
        ? "No rental products"
        : "Sync required";

  return (
    <s-page heading="Backup dress discount" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-box padding="large" border="base" borderRadius="large" background="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone={statusTone}>{statusLabel}</s-badge>
              {ready ? (
                <s-text tone="neutral" color="subdued">
                  Variants ready · cart updates automatically
                </s-text>
              ) : null}
            </s-stack>

            <s-text tone="neutral" color="subdued">
              Two or more gowns with the same hire dates → about half at full price (Main Hire),
              the rest at {BACKUP_PERCENT}% off (Backup dress). No Shopify Plus needed.
            </s-text>

            <div className="gk-backup-admin-stats">
              <div className="gk-backup-admin-stat">
                <span className="gk-backup-admin-stat__label">Storefront</span>
                <span className="gk-backup-admin-stat__value">
                  {discountEnabled ? "On" : "Off"}
                </span>
              </div>
              <div className="gk-backup-admin-stat">
                <span className="gk-backup-admin-stat__label">Backup pricing</span>
                <span className="gk-backup-admin-stat__value">
                  {coverage.withBackupVariant}/{coverage.variantRows || "—"}
                </span>
              </div>
              <div className="gk-backup-admin-stat">
                <span className="gk-backup-admin-stat__label">Rental products</span>
                <span className="gk-backup-admin-stat__value">
                  {coverage.enabledRentalProducts}
                </span>
              </div>
            </div>
          </s-stack>
        </s-box>

        {actionData?.intent === "sync-backup-variants" ? (
          <s-banner tone={actionData.ok ? "success" : "critical"}>
            {actionData.ok
              ? `Synced — ${coverage.withBackupVariant} of ${coverage.variantRows} hire variants have backup pricing.`
              : syncErrors.length
                ? "Sync finished with errors (see below)."
                : `${coverage.missingBackupVariant} variant(s) still need backup pricing — try Sync again.`}
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

        {coverage.variantRows === 0 ? (
          <s-banner tone="warning">
            Enable rentals on at least one product in{" "}
            <s-link href="/app/products">Rental products</s-link>, then run Sync.
          </s-banner>
        ) : !ready && discountEnabled ? (
          <s-banner tone="warning">
            {coverage.missingBackupVariant} hire variant(s) still missing backup pricing — run Sync
            before testing the cart.
          </s-banner>
        ) : null}

        <s-section heading="Controls">
          <s-stack direction="block" gap="base">
            <Form method="post">
              <input type="hidden" name="intent" value="set-backup-discount-enabled" />
              <label className="gk-toggle-row">
                <input
                  type="checkbox"
                  name="enabled"
                  value="true"
                  aria-label="Enable backup dress discount on storefront"
                  defaultChecked={discountEnabled}
                  disabled={isSavingDiscount}
                  onChange={(event) => {
                    event.currentTarget.form?.requestSubmit();
                  }}
                />
                <span className="gk-toggle-row__copy">
                  <span className="gk-toggle-row__title">Enable on storefront</span>
                  <span className="gk-toggle-row__desc">
                    Cart assigns Main / Backup tiers and swaps to the correct variant price.
                  </span>
                </span>
              </label>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="sync-backup-variants" />
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-button
                  type="submit"
                  variant="primary"
                  disabled={
                    isSyncing ||
                    coverage.enabledRentalProducts === 0
                  }
                  {...(isSyncing ? { loading: true } : {})}
                >
                  Sync backup variants
                </s-button>
                <s-text tone="neutral" color="subdued">
                  Creates {BACKUP_PERCENT}% off siblings in Shopify. Run after new rental SKUs.
                </s-text>
              </s-stack>
            </Form>
          </s-stack>
        </s-section>

        <s-section heading="First-time setup">
          <ol className="gk-backup-admin-steps">
            <li>Theme editor → App embeds → turn on GK.Drobe Cart.</li>
            <li>
              Run Sync backup variants until every hire variant shows backup pricing (
              {coverage.variantRows > 0 ? `${coverage.variantRows}/${coverage.variantRows}` : "full"}
              ).
            </li>
            <li>Turn Enable on storefront on, then add two gowns with the same hire dates to test.</li>
          </ol>
        </s-section>

        <s-stack direction="inline" gap="small">
          <s-button href="/app/backup-flagged-orders" variant="secondary">
            Flagged orders
          </s-button>
          <s-button href="/app/products" variant="tertiary">
            Rental products
          </s-button>
        </s-stack>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const ErrorBoundary = boundary.error;