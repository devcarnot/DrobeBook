import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { BACKUP_DRESS_DISCOUNT_TITLE } from "../lib/booking/backup-dress-discount";
import {
  ensureBackupDressAutomaticDiscount,
  getBackupDressDiscountStatus,
} from "../lib/booking/backup-dress-discount.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const status = await getBackupDressDiscountStatus(admin);
  return { status, discountTitle: BACKUP_DRESS_DISCOUNT_TITLE };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "enable") {
    const result = await ensureBackupDressAutomaticDiscount(admin);
    const status = await getBackupDressDiscountStatus(admin);
    return { ...result, status };
  }

  return {
    ok: false,
    created: false,
    activated: false,
    discountNodeId: null,
    errors: ["Unknown action."],
    status: await getBackupDressDiscountStatus(admin),
  };
};

export default function BackupDressDiscountPage() {
  const { status: loaderStatus, discountTitle } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const status = actionData?.status ?? loaderStatus;
  const isSaving =
    navigation.state === "submitting" || navigation.state === "loading";

  const resultErrors = actionData?.errors ?? [];
  const enableMessage =
    actionData?.ok === true
      ? actionData.created
        ? "Automatic checkout discount created and activated."
        : actionData.activated
          ? "Discount activated."
          : "Discount is already active."
      : actionData
        ? resultErrors.join(" ") || "Could not enable discount."
        : null;

  return (
    <s-page heading="Backup dress hire discount">
      <s-section heading="Checkout discount">
        <s-stack direction="block" gap="base">
          <s-text>
            Applies <s-text type="strong">80% off</s-text> on the cheaper extra
            gowns in the same hire period at checkout (pairs with cart display
            pricing). You do not need a discount code — this is an automatic app
            discount.
          </s-text>

          <s-box padding="base" border="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">Status</s-text>
              {status.loadErrors?.length ? (
                <s-banner tone="warning" heading="Could not load discount data">
                  {status.loadErrors.join(" ")}
                </s-banner>
              ) : null}

              {!status.functionId ? (
                <s-banner tone="warning" heading="Function not deployed">
                  Deploy the DrobeBook app version that includes{" "}
                  <s-text type="strong">gown-backup-discount</s-text> (GitHub
                  deploy workflow), then refresh this page.
                </s-banner>
              ) : status.active ? (
                <s-banner tone="success" heading="Active at checkout">
                  {discountTitle} is on. Customers see the discount
                  on qualifying backup dress lines when they check out.
                </s-banner>
              ) : (
                <s-banner tone="warning" heading="Not active yet">
                  Function is installed but the automatic discount is missing or
                  inactive. Click enable below.
                </s-banner>
              )}

              <s-text tone="neutral" color="subdued">
                Function: {status.functionTitle ?? "—"}{" "}
                {status.functionId ? `(${status.functionId})` : ""}
              </s-text>
              {status.discountStatus ? (
                <s-text tone="neutral" color="subdued">
                  Discount: {status.discountTitle ?? discountTitle}{" "}
                  — {status.discountStatus}
                </s-text>
              ) : null}
            </s-stack>
          </s-box>

          {enableMessage ? (
            <s-banner
              tone={actionData?.ok ? "success" : "critical"}
              heading={actionData?.ok ? "Done" : "Error"}
            >
              {enableMessage}
            </s-banner>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="enable" />
            <s-button
              type="submit"
              variant="primary"
              disabled={!status.functionId || isSaving || status.active}
            >
              {isSaving ? "Enabling…" : "Enable automatic checkout discount"}
            </s-button>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="How to test (step by step)">
        <s-stack direction="block" gap="small">
          <s-text>1. Enable the discount above until status shows Active.</s-text>
          <s-text>
            2. On the storefront, add <s-text type="strong">two or more gowns</s-text>{" "}
            with the <s-text type="strong">same delivery & return dates</s-text>{" "}
            and duration (use the hire widget; clutch-only lines do not count).
          </s-text>
          <s-text>
            3. Open cart — backup lines should show the badge and 20% price (cart
            script). Main line stays full price.
          </s-text>
          <s-text>
            4. Go to checkout — line items for backup dresses should show{" "}
            <s-text type="strong">Backup dress — 80% off</s-text> (or equivalent
            discount line) and reduced totals.
          </s-text>
          <s-text tone="neutral" color="subdued">
            One gown only → no backup discount (by design). Different hire dates
            → each group priced separately.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Admin shortcuts">
        <s-stack direction="inline" gap="small">
          <s-button
            href="shopify:admin/discounts"
            variant="secondary"
          >
            Open Discounts in Shopify
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