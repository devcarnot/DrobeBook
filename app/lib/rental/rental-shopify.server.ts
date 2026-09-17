import { Prisma } from "@prisma/client";

import { extractNumericId, toVariantGid } from "../shopify-ids";
import type { CreateRentalInput } from "./rental.server";
import type { DeliveryAddress, ShopifyOrderMode } from "./rental.types";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ResolvedShopifyCustomer = {
  customerId: string;
  legacyCustomerId: string;
  email: string | null;
  displayName: string | null;
};

export type ShopifyRentalOrderResult = {
  orderId: string;
  orderKind: "draft" | "order";
  orderName: string | null;
  pricePaid: Prisma.Decimal | null;
  adminUrl: string;
};

const CUSTOMERS_BY_EMAIL_QUERY = `#graphql
  query RentalCustomersByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
        legacyResourceId
        displayName
        defaultEmailAddress {
          emailAddress
        }
      }
    }
  }
`;

const CUSTOMER_CREATE_MUTATION = `#graphql
  mutation RentalCustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        legacyResourceId
        displayName
        defaultEmailAddress {
          emailAddress
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VARIANT_PRICE_QUERY = `#graphql
  query RentalVariantPrice($id: ID!) {
    productVariant(id: $id) {
      id
      price
    }
  }
`;

const DRAFT_ORDER_CREATE_MUTATION = `#graphql
  mutation RentalDraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        legacyResourceId
        name
        totalPriceSet {
          shopMoney {
            amount
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_CREATE_MUTATION = `#graphql
  mutation RentalOrderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        legacyResourceId
        name
        totalPriceSet {
          shopMoney {
            amount
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function splitCustomerName(name: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return { firstName: "Rental", lastName: "Customer" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shopAdminBase(shop: string) {
  return `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}`;
}

export function shopifyRentalOrderAdminUrl(
  shop: string,
  orderId: string,
  mode: ShopifyOrderMode,
) {
  const base = shopAdminBase(shop);
  if (mode === "draft") {
    return `${base}/draft_orders/${extractNumericId(orderId)}`;
  }
  return `${base}/orders/${extractNumericId(orderId)}`;
}

function buildLineItemAttributes(input: CreateRentalInput, bookingId: string) {
  const deliveryLabel =
    input.deliveryMethod === "pickup" ? "Local Pickup" : "Post (Shipping)";

  return [
    { key: "_Size", value: input.size },
    { key: "Delivery Method", value: deliveryLabel },
    { key: "Delivery Date", value: formatDisplayDate(input.rentalStart) },
    { key: "Return Date", value: formatDisplayDate(input.rentalEnd) },
    { key: "Event Date", value: formatDisplayDate(input.eventDate || input.rentalEnd) },
    { key: "_gk_booking_id", value: bookingId },
    { key: "Rental source", value: "GK.Drobe manual rental" },
  ];
}

function buildShippingAddress(address: DeliveryAddress) {
  if (!address.address1?.trim()) {
    return undefined;
  }

  return {
    address1: address.address1,
    address2: address.address2 || undefined,
    city: address.city || undefined,
    province: address.province || undefined,
    zip: address.zip || undefined,
    country: address.country || undefined,
  };
}

async function fetchVariantPrice(
  admin: AdminGraphqlClient,
  variantId: string,
): Promise<string | null> {
  const response = await admin.graphql(VARIANT_PRICE_QUERY, {
    variables: { id: toVariantGid(variantId) },
  });
  const json = (await response.json()) as {
    data?: { productVariant?: { price?: string | null } | null };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  return json.data?.productVariant?.price ?? null;
}

async function resolvePricePaid(
  admin: AdminGraphqlClient,
  input: CreateRentalInput,
): Promise<Prisma.Decimal | null> {
  if (input.pricePaid?.trim()) {
    const amount = Number.parseFloat(input.pricePaid);
    if (!Number.isNaN(amount)) {
      return new Prisma.Decimal(amount);
    }
  }

  const variantPrice = await fetchVariantPrice(admin, input.variantId);
  if (!variantPrice) {
    return null;
  }

  const amount = Number.parseFloat(variantPrice);
  return Number.isNaN(amount) ? null : new Prisma.Decimal(amount);
}

function parseGraphqlErrors(
  label: string,
  errors?: Array<{ message?: string }>,
  userErrors?: Array<{ message?: string }>,
) {
  const message =
    errors?.map((error) => error.message).filter(Boolean).join("; ") ||
    userErrors?.map((error) => error.message).filter(Boolean).join("; ");

  if (message) {
    throw new Error(`${label}: ${message}`);
  }
}

export async function resolveShopifyCustomer(
  admin: AdminGraphqlClient,
  input: {
    shopifyCustomerId?: string | null;
    email?: string | null;
    name?: string | null;
  },
): Promise<ResolvedShopifyCustomer | null> {
  const email = input.email?.trim().toLowerCase();
  const shopifyCustomerId = input.shopifyCustomerId?.trim();

  if (shopifyCustomerId) {
    return {
      customerId: shopifyCustomerId.startsWith("gid://")
        ? shopifyCustomerId
        : `gid://shopify/Customer/${extractNumericId(shopifyCustomerId)}`,
      legacyCustomerId: extractNumericId(shopifyCustomerId),
      email: email ?? null,
      displayName: input.name?.trim() || null,
    };
  }

  if (!email) {
    return null;
  }

  const searchResponse = await admin.graphql(CUSTOMERS_BY_EMAIL_QUERY, {
    variables: { query: `email:${email}` },
  });
  const searchJson = (await searchResponse.json()) as {
    data?: {
      customers?: {
        nodes?: Array<{
          id?: string;
          legacyResourceId?: string;
          displayName?: string;
          defaultEmailAddress?: { emailAddress?: string | null } | null;
        }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  parseGraphqlErrors("Customer lookup failed", searchJson.errors);

  const existing = searchJson.data?.customers?.nodes?.[0];
  if (existing?.id) {
    const resolvedEmail =
      existing.defaultEmailAddress?.emailAddress?.trim() || email;
    return {
      customerId: existing.id,
      legacyCustomerId: existing.legacyResourceId ?? extractNumericId(existing.id),
      email: resolvedEmail,
      displayName: existing.displayName ?? input.name?.trim() ?? null,
    };
  }

  const { firstName, lastName } = splitCustomerName(input.name);
  const createResponse = await admin.graphql(CUSTOMER_CREATE_MUTATION, {
    variables: {
      input: {
        email,
        firstName,
        lastName: lastName || undefined,
      },
    },
  });
  const createJson = (await createResponse.json()) as {
    data?: {
      customerCreate?: {
        customer?: {
          id?: string;
          legacyResourceId?: string;
          displayName?: string;
          defaultEmailAddress?: { emailAddress?: string | null } | null;
        } | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  parseGraphqlErrors(
    "Customer create failed",
    createJson.errors,
    createJson.data?.customerCreate?.userErrors,
  );

  const created = createJson.data?.customerCreate?.customer;
  if (!created?.id) {
    throw new Error("Customer create failed: Shopify did not return a customer.");
  }

  const resolvedEmail =
    created.defaultEmailAddress?.emailAddress?.trim() || email;

  return {
    customerId: created.id,
    legacyCustomerId: created.legacyResourceId ?? extractNumericId(created.id),
    email: resolvedEmail,
    displayName: created.displayName ?? input.name?.trim() ?? null,
  };
}

export async function createShopifyOrderForRental(
  admin: AdminGraphqlClient,
  shop: string,
  bookingId: string,
  input: CreateRentalInput,
  customer: ResolvedShopifyCustomer | null,
): Promise<ShopifyRentalOrderResult> {
  const pricePaid = await resolvePricePaid(admin, input);
  const lineItemAttributes = buildLineItemAttributes(input, bookingId);
  const shippingAddress = buildShippingAddress(input.deliveryAddress);
  const note = [
    input.rentalNotes?.trim(),
    `Manual rental ${bookingId}`,
    input.tags.length ? `Tags: ${input.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (input.shopifyOrderMode === "draft") {
    const response = await admin.graphql(DRAFT_ORDER_CREATE_MUTATION, {
      variables: {
        input: {
          customerId: customer?.customerId,
          email: customer?.email ?? input.customerEmail?.trim() ?? undefined,
          lineItems: [
            {
              variantId: toVariantGid(input.variantId),
              quantity: 1,
              customAttributes: lineItemAttributes,
            },
          ],
          shippingAddress,
          billingAddress: shippingAddress,
          note: note || undefined,
          tags: ["gk-drobe-rental", ...input.tags],
        },
      },
    });

    const json = (await response.json()) as {
      data?: {
        draftOrderCreate?: {
          draftOrder?: {
            id?: string;
            legacyResourceId?: string;
            name?: string;
            totalPriceSet?: { shopMoney?: { amount?: string } };
          } | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    parseGraphqlErrors(
      "Draft order create failed",
      json.errors,
      json.data?.draftOrderCreate?.userErrors,
    );

    const draftOrder = json.data?.draftOrderCreate?.draftOrder;
    if (!draftOrder?.legacyResourceId) {
      throw new Error("Draft order create failed: Shopify did not return a draft order.");
    }

    const amount = draftOrder.totalPriceSet?.shopMoney?.amount;
    return {
      orderId: draftOrder.legacyResourceId,
      orderKind: "draft",
      orderName: draftOrder.name ?? null,
      pricePaid:
        amount && !Number.isNaN(Number.parseFloat(amount))
          ? new Prisma.Decimal(amount)
          : pricePaid,
      adminUrl: shopifyRentalOrderAdminUrl(shop, draftOrder.legacyResourceId, "draft"),
    };
  }

  const amountString = pricePaid?.toFixed(2) ?? "0.00";
  const response = await admin.graphql(ORDER_CREATE_MUTATION, {
    variables: {
      order: {
        customerId: customer?.customerId,
        email: customer?.email ?? input.customerEmail?.trim() ?? undefined,
        lineItems: [
          {
            variantId: toVariantGid(input.variantId),
            quantity: 1,
            properties: lineItemAttributes.map((attribute) => ({
              name: attribute.key,
              value: attribute.value,
            })),
          },
        ],
        shippingAddress,
        billingAddress: shippingAddress,
        financialStatus: input.shopifyOrderMode === "paid" ? "PAID" : "PENDING",
        note: note || undefined,
        tags: ["gk-drobe-rental", ...input.tags],
        ...(input.shopifyOrderMode === "paid"
          ? {
              transactions: [
                {
                  kind: "SALE",
                  status: "SUCCESS",
                  amountSet: {
                    shopMoney: {
                      amount: amountString,
                      currencyCode: "AUD",
                    },
                  },
                },
              ],
            }
          : {}),
      },
      options: {
        sendReceipt: false,
        inventoryBehaviour: "BYPASS",
      },
    },
  });

  const json = (await response.json()) as {
    data?: {
      orderCreate?: {
        order?: {
          id?: string;
          legacyResourceId?: string;
          name?: string;
          totalPriceSet?: { shopMoney?: { amount?: string } };
        } | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  parseGraphqlErrors(
    "Order create failed",
    json.errors,
    json.data?.orderCreate?.userErrors,
  );

  const order = json.data?.orderCreate?.order;
  if (!order?.legacyResourceId) {
    throw new Error("Order create failed: Shopify did not return an order.");
  }

  const amount = order.totalPriceSet?.shopMoney?.amount;
  return {
    orderId: order.legacyResourceId,
    orderKind: "order",
    orderName: order.name ?? null,
    pricePaid:
      amount && !Number.isNaN(Number.parseFloat(amount))
        ? new Prisma.Decimal(amount)
        : pricePaid,
    adminUrl: shopifyRentalOrderAdminUrl(shop, order.legacyResourceId, input.shopifyOrderMode),
  };
}

export function validateShopifyOrderRequirements(input: CreateRentalInput) {
  if (input.shopifyOrderMode === "none") {
    return;
  }

  if (!input.customerEmail?.trim() && !input.shopifyCustomerId?.trim()) {
    throw new Error(
      "Choose a Shopify customer or enter an email before creating a Shopify order.",
    );
  }
}
