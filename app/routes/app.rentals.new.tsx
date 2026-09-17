import { useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";

import {
  RentalCustomerPicker,
  type SelectedRentalCustomer,
} from "../components/RentalCustomerPicker";
import {
  RentalProductPicker,
  type SelectedRentalProduct,
} from "../components/RentalProductPicker";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { SettingsSplitLayout } from "../components/SettingsSplitLayout";
import { listCustomersForPicker } from "../lib/rental/rental-customers.server";
import { createRental } from "../lib/rental/rental.server";
import {
  RENTAL_STATUS_LABELS,
  RENTAL_WORKFLOW_STATUSES,
  type DeliveryAddress,
  type RentalWorkflowStatus,
  type ShopifyOrderMode,
} from "../lib/rental/rental.types";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const ORDER_MODES: Array<{ value: ShopifyOrderMode; label: string }> = [
  { value: "none", label: "Don't Create a Shopify Order" },
  { value: "draft", label: "Create a Draft Shopify Order" },
  { value: "pending", label: "Create a Shopify Order with Payment Pending" },
  { value: "paid", label: "Create a Shopify Order and Mark it as Paid" },
];

function readFieldValue(event: {
  currentTarget: { value?: string } | null;
  target?: EventTarget | null;
}) {
  return (
    event.currentTarget?.value ??
    (event.target as HTMLInputElement | null)?.value ??
    ""
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "search-customers") {
    try {
      const customers = await listCustomersForPicker(admin, {
        query: String(formData.get("q") ?? ""),
      });
      return { customers };
    } catch (error) {
      return {
        customers: [],
        error:
          error instanceof Error
            ? error.message
            : "Could not load Shopify customers.",
        requiresProtectedCustomerData:
          error instanceof Error &&
          "requiresProtectedCustomerData" in error &&
          Boolean(error.requiresProtectedCustomerData),
      };
    }
  }

  const productId = String(formData.get("productId") ?? "").trim();
  const variantId = String(formData.get("variantId") ?? "").trim();
  const productTitle = String(formData.get("productTitle") ?? "").trim();
  const rentalStart = String(formData.get("rentalStart") ?? "");
  const rentalEnd = String(formData.get("rentalEnd") ?? "");

  if (!productTitle || !productId || !variantId || !rentalStart || !rentalEnd) {
    return {
      ok: false,
      message: "Product details, variant, and rental dates are required.",
    };
  }

  if (rentalEnd < rentalStart) {
    return { ok: false, message: "Rental end must be on or after rental start." };
  }

  const shopifyCustomerId = String(formData.get("shopifyCustomerId") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim();
  if (!shopifyCustomerId || !customerEmail) {
    return { ok: false, message: "Select a Shopify customer before creating the rental." };
  }

  const deliveryAddress: DeliveryAddress = {
    address1: String(formData.get("address1") ?? ""),
    address2: String(formData.get("address2") ?? ""),
    city: String(formData.get("city") ?? ""),
    province: String(formData.get("province") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    country: String(formData.get("country") ?? ""),
  };

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  try {
    const rental = await createRental(
      session.shop,
      {
      shopifyOrderMode: String(formData.get("shopifyOrderMode") ?? "none") as ShopifyOrderMode,
      shopifyCustomerId: String(formData.get("shopifyCustomerId") ?? "") || null,
      customerName: String(formData.get("customerName") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      productId,
      variantId,
      productTitle,
      size: String(formData.get("size") ?? ""),
      deliveryMethod: String(formData.get("deliveryMethod") ?? "post"),
      rentalStart,
      rentalEnd,
      eventDate: String(formData.get("eventDate") ?? rentalEnd),
      bufferBeforeDays: Number.parseInt(String(formData.get("bufferBeforeDays") ?? "0"), 10) || 0,
      bufferBeforeUnit: String(formData.get("bufferBeforeUnit") ?? "calendar"),
      bufferAfterDays: Number.parseInt(String(formData.get("bufferAfterDays") ?? "0"), 10) || 0,
      bufferAfterUnit: String(formData.get("bufferAfterUnit") ?? "calendar"),
      workflowStatus: String(formData.get("workflowStatus") ?? "confirmed") as RentalWorkflowStatus,
      rentalNotes: String(formData.get("rentalNotes") ?? ""),
      fulfillmentTrackingNumber: String(formData.get("fulfillmentTrackingNumber") ?? ""),
      fulfillmentTrackingLink: String(formData.get("fulfillmentTrackingLink") ?? ""),
      returnTrackingNumber: String(formData.get("returnTrackingNumber") ?? ""),
      returnTrackingLink: String(formData.get("returnTrackingLink") ?? ""),
      tags,
      deliveryAddress,
      pricePaid: String(formData.get("pricePaid") ?? "") || undefined,
      },
      admin,
    );

    return redirect(`/app/rentals/${rental.id}`);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create rental.",
    };
  }
};

function FormSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <s-box padding="large" background="base" border="base" borderRadius="large">
      <s-stack direction="block" gap="large">
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text type="strong">{title}</s-text>
          {action}
        </s-stack>
        {children}
      </s-stack>
    </s-box>
  );
}

export default function NewRentalPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [customer, setCustomer] = useState<SelectedRentalCustomer>({
    shopifyCustomerId: null,
    name: "",
    email: "",
    source: "manual",
  });
  const [selectedProduct, setSelectedProduct] = useState<SelectedRentalProduct | null>(null);
  const [size, setSize] = useState("");

  const productSelected = Boolean(selectedProduct);

  return (
    <s-page heading="Create New Rental" inlineSize="large">
      <s-stack direction="block" gap="large">
        <s-link href="/app/rentals">← Back to rentals</s-link>

        {actionData && "message" in actionData && actionData.message ? (
          <s-banner tone="critical">{actionData.message}</s-banner>
        ) : null}

        <Form method="post">
          <input type="hidden" name="productTitle" value={selectedProduct?.productTitle ?? ""} />
          <input type="hidden" name="productId" value={selectedProduct?.productId ?? ""} />
          <input type="hidden" name="variantId" value={selectedProduct?.variantId ?? ""} />
          <input type="hidden" name="customerName" value={customer.name} />
          <input type="hidden" name="customerEmail" value={customer.email} />
          <input
            type="hidden"
            name="shopifyCustomerId"
            value={customer.shopifyCustomerId ?? ""}
          />
          <input type="hidden" name="size" value={size} />

          <SettingsSplitLayout
            editor={
              <s-stack direction="block" gap="large">
                <FormSection title="Upon creation of this Rental…">
                  <s-stack direction="block" gap="base">
                    {ORDER_MODES.map((mode) => (
                      <label key={mode.value} style={{ display: "flex", gap: "0.65rem" }}>
                        <input
                          type="radio"
                          name="shopifyOrderMode"
                          value={mode.value}
                          defaultChecked={mode.value === "none"}
                        />
                        <span>{mode.label}</span>
                      </label>
                    ))}
                  </s-stack>
                </FormSection>

                <FormSection title="Customer">
                  <RentalCustomerPicker selection={customer} onChange={setCustomer} />
                </FormSection>

                <FormSection title="Select Products">
                  <s-stack direction="block" gap="base">
                    <RentalProductPicker
                      selection={selectedProduct}
                      onSelect={(selection) => {
                        setSelectedProduct(selection);
                        if (!size && selection.variantTitle) {
                          setSize(selection.variantTitle);
                        }
                      }}
                      onClear={() => setSelectedProduct(null)}
                    />
                    {productSelected ? (
                      <s-text-field
                        label="Size"
                        value={size}
                        onChange={(event) => setSize(readFieldValue(event))}
                        placeholder="e.g. AU 8"
                      />
                    ) : null}
                  </s-stack>
                </FormSection>

                <FormSection title="Dates & Delivery">
                  <s-stack direction="block" gap="large">
                    <s-select label="Delivery method" name="deliveryMethod" value="post">
                      <s-option value="post">Post (Shipping)</s-option>
                      <s-option value="pickup">Local Pickup</s-option>
                    </s-select>

                    <div className="gk-rental-form__group">
                      <span className="gk-rental-form__group-label">Start buffer</span>
                      <ResponsiveGrid layout="2" gap="base" alignItems="start">
                        <s-number-field
                          label="Days before rental"
                          name="bufferBeforeDays"
                          value="0"
                          min={0}
                        />
                        <s-select label="Unit" name="bufferBeforeUnit" value="calendar">
                          <s-option value="calendar">Calendar days</s-option>
                          <s-option value="business">Business days</s-option>
                        </s-select>
                      </ResponsiveGrid>
                    </div>

                    <ResponsiveGrid layout="2" gap="base" alignItems="start">
                      <s-date-field label="Rental start" name="rentalStart" required />
                      <s-date-field label="Rental end" name="rentalEnd" required />
                    </ResponsiveGrid>

                    <div className="gk-rental-form__group">
                      <span className="gk-rental-form__group-label">End buffer</span>
                      <ResponsiveGrid layout="2" gap="base" alignItems="start">
                        <s-number-field
                          label="Days after rental"
                          name="bufferAfterDays"
                          value="0"
                          min={0}
                        />
                        <s-select label="Unit" name="bufferAfterUnit" value="calendar">
                          <s-option value="calendar">Calendar days</s-option>
                          <s-option value="business">Business days</s-option>
                        </s-select>
                      </ResponsiveGrid>
                    </div>

                    <ResponsiveGrid layout="2" gap="base" alignItems="start">
                      <s-date-field label="Event date" name="eventDate" />
                      <s-text-field label="Price paid" name="pricePaid" placeholder="Optional" />
                    </ResponsiveGrid>
                  </s-stack>
                </FormSection>

                <FormSection title="Delivery Address">
                  <s-stack direction="block" gap="base">
                    <s-text-field label="Street address" name="address1" />
                    <s-text-field label="Apartment, suite, etc." name="address2" />
                    <s-text-field label="City" name="city" />
                    <ResponsiveGrid layout="3" gap="base" alignItems="start">
                      <s-text-field label="State/Province/Region" name="province" />
                      <s-text-field label="Zip/Postal code" name="zip" />
                      <s-text-field label="Country" name="country" />
                    </ResponsiveGrid>
                  </s-stack>
                </FormSection>

                <s-box padding="large" background="base" border="base" borderRadius="large">
                  <s-button type="submit" variant="primary" {...(isSubmitting ? { loading: true } : {})}>
                    Create rental
                  </s-button>
                </s-box>
              </s-stack>
            }
            preview={
              <s-stack direction="block" gap="large">
                <FormSection title="Status">
                  <s-select label="Status" name="workflowStatus" value="confirmed">
                    {RENTAL_WORKFLOW_STATUSES.map((status) => (
                      <s-option key={status} value={status}>
                        {RENTAL_STATUS_LABELS[status]}
                      </s-option>
                    ))}
                  </s-select>
                </FormSection>

                <FormSection title="Rental Notes">
                  <s-text-area
                    label="Notes"
                    name="rentalNotes"
                    rows={4}
                    placeholder="None entered"
                  />
                </FormSection>

                <FormSection title="Fulfillment">
                  <s-stack direction="block" gap="base">
                    <s-text-field label="Tracking Number" name="fulfillmentTrackingNumber" />
                    <s-text-field label="Tracking Link" name="fulfillmentTrackingLink" />
                  </s-stack>
                </FormSection>

                <FormSection title="Return">
                  <s-stack direction="block" gap="base">
                    <s-text-field label="Return Tracking Number" name="returnTrackingNumber" />
                    <s-text-field label="Return Tracking Link" name="returnTrackingLink" />
                  </s-stack>
                </FormSection>

                <FormSection title="Tags">
                  <s-text-field
                    label="Tags"
                    name="tags"
                    placeholder="Search..."
                    details="Comma-separated tags, e.g. wedding, urgent, VIP"
                  />
                </FormSection>
              </s-stack>
            }
          />
        </Form>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
