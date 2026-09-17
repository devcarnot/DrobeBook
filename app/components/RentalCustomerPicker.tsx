import { useAppBridge } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type { RentalCustomerOption } from "../lib/rental/rental-customers.server";

export type SelectedRentalCustomer = {
  shopifyCustomerId: string | null;
  name: string;
  email: string;
  source: "shopify" | "manual";
};

type CustomerSearchResponse = {
  customers?: RentalCustomerOption[];
  error?: string;
  requiresProtectedCustomerData?: boolean;
};

type ShopifyPicker = {
  picker: (options: {
    heading: string;
    multiple: false;
    headers: Array<{ content: string; type?: "string" | "number" }>;
    items: Array<{
      id: string;
      heading: string;
      data: Array<string | number | undefined>;
      disabled?: boolean;
      badges?: Array<{ content: string; tone?: string }>;
    }>;
  }) => Promise<{ selected: Promise<string[] | undefined> }>;
};

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

function applyCustomer(
  customer: RentalCustomerOption,
  onChange: (selection: SelectedRentalCustomer) => void,
) {
  if (!customer.email) {
    throw new Error("That Shopify customer does not have an email address.");
  }

  onChange({
    shopifyCustomerId: customer.legacyId,
    name: customer.name,
    email: customer.email,
    source: "shopify",
  });
}

function buildPickerItems(rows: RentalCustomerOption[]) {
  return rows.map((customer) => ({
    id: customer.legacyId,
    heading: customer.name,
    data: [customer.email || "No email"],
    disabled: !customer.email,
    badges: customer.email
      ? undefined
      : [{ content: "No email", tone: "warning" }],
  }));
}

export function RentalCustomerPicker({
  selection,
  onChange,
}: {
  selection: SelectedRentalCustomer;
  onChange: (selection: SelectedRentalCustomer) => void;
}) {
  const shopify = useAppBridge();
  const fetcher = useFetcher<CustomerSearchResponse>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accessWarning, setAccessWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pendingRowsRef = useRef<RentalCustomerOption[] | null>(null);

  const isLoading = fetcher.state !== "idle";

  const submitCustomerSearch = useCallback(
    (query = "") => {
      const formData = new FormData();
      formData.set("intent", "search-customers");
      formData.set("q", query);
      fetcher.submit(formData, { method: "post" });
    },
    [fetcher],
  );

  const openPickerWithRows = useCallback(
    async (rows: RentalCustomerOption[]) => {
      if (rows.length === 0) {
        setErrorMessage(
          "No Shopify customers found. Add a customer in Shopify Admin first.",
        );
        return;
      }

      const pickerApi = (shopify as unknown as ShopifyPicker).picker;
      if (typeof pickerApi !== "function") {
        setErrorMessage("Customer picker is unavailable in this session.");
        return;
      }

      try {
        const picker = await pickerApi({
          heading: "Select customer",
          multiple: false,
          headers: [{ content: "Email", type: "string" }],
          items: buildPickerItems(rows),
        });

        const selectedIds = await picker.selected;
        if (!selectedIds?.length) {
          return;
        }

        const customer = rows.find((row) => row.legacyId === selectedIds[0]);
        if (!customer) {
          throw new Error("Could not read the selected customer.");
        }

        applyCustomer(customer, onChange);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not open customer picker.",
        );
      }
    },
    [onChange, shopify],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }

    if (fetcher.data.error) {
      setErrorMessage(fetcher.data.error);
      setAccessWarning(Boolean(fetcher.data.requiresProtectedCustomerData));
      pendingRowsRef.current = null;
      return;
    }

    const rows = fetcher.data.customers ?? [];
    setErrorMessage(null);
    setAccessWarning(false);

    if (pendingRowsRef.current !== null) {
      pendingRowsRef.current = null;
      void openPickerWithRows(rows);
      return;
    }

    if (rows.length === 0) {
      setErrorMessage("No customers matched that search.");
    }
  }, [fetcher.state, fetcher.data, openPickerWithRows]);

  function openCustomerPicker() {
    setErrorMessage(null);
    setAccessWarning(false);
    pendingRowsRef.current = [];
    submitCustomerSearch(searchQuery);
  }

  function clearCustomer() {
    onChange({
      shopifyCustomerId: null,
      name: "",
      email: "",
      source: "manual",
    });
    setSearchQuery("");
    setErrorMessage(null);
    setAccessWarning(false);
  }

  const hasCustomer = Boolean(selection.email.trim() || selection.name.trim());

  return (
    <s-stack direction="block" gap="small">
      {errorMessage ? (
        <s-banner tone={accessWarning ? "warning" : "critical"}>{errorMessage}</s-banner>
      ) : null}

      {hasCustomer ? (
        <s-box padding="base" background="subdued" border="base" borderRadius="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">{selection.name || "Customer"}</s-text>
            <s-text tone="neutral" color="subdued">
              {selection.email || "No email"}
              {selection.source === "shopify" && selection.shopifyCustomerId
                ? ` · Shopify customer ${selection.shopifyCustomerId}`
                : ""}
            </s-text>
            <s-stack direction="inline" gap="small">
              <s-button
                type="button"
                variant="secondary"
                onClick={openCustomerPicker}
                {...(isLoading ? { loading: true } : {})}
              >
                Change customer
              </s-button>
              <s-button type="button" variant="tertiary" tone="critical" onClick={clearCustomer}>
                Clear
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ) : (
        <s-stack direction="inline" gap="small" alignItems="end">
          <div style={{ flex: 1, minWidth: 0 }}>
            <s-text-field
              label="Search customers"
              value={searchQuery}
              placeholder="Name or email"
              onChange={(event) => setSearchQuery(readFieldValue(event))}
            />
          </div>
          <s-button
            type="button"
            variant="primary"
            icon="person"
            onClick={openCustomerPicker}
            {...(isLoading ? { loading: true } : {})}
          >
            Select from Shopify customers
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}
