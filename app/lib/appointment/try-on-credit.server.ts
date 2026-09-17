import { Prisma } from "@prisma/client";

import prisma from "../../db.server";
import type { OrderLineItem } from "../order-booking.server";
import { sendNotificationEmail } from "../notifications/notification-email.server";
import { getShopConfig } from "../shop-settings.server";
import {
  isAppointmentLineItem,
  parseAppointmentLineItem,
} from "./appointment-order.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const CREATE_DISCOUNT_MUTATION = `#graphql
  mutation CreateTryOnCreditDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_DISCOUNT_MUTATION = `#graphql
  mutation DeactivateTryOnCreditDiscount($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CUSTOMER_BY_EMAIL_QUERY = `#graphql
  query TryOnCreditCustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        id
        email
      }
    }
  }
`;

const CREATE_CUSTOMER_MUTATION = `#graphql
  mutation CreateTryOnCreditCustomer($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        id
        email
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const COLLECTION_BY_HANDLE_QUERY = `#graphql
  query TryOnCreditCollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      id
    }
  }
`;

const UPDATE_ORDER_NOTE_MUTATION = `#graphql
  mutation AppendTryOnCreditNote($id: ID!, $note: String!) {
    orderUpdate(input: { id: $id, note: $note }) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function generateDiscountCode(appointmentId: string): string {
  const suffix = appointmentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `TRYON-${suffix || Date.now().toString(36).toUpperCase()}`;
}

function parseAmount(value: string | null | undefined): Prisma.Decimal | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) {
    return null;
  }

  return new Prisma.Decimal(amount);
}

async function resolveCustomerId(
  admin: AdminGraphqlClient,
  email: string,
): Promise<string | null> {
  const lookupResponse = await admin.graphql(CUSTOMER_BY_EMAIL_QUERY, {
    variables: { query: `email:${email}` },
  });
  const lookupJson = (await lookupResponse.json()) as {
    data?: {
      customers?: {
        nodes?: Array<{ id?: string | null; email?: string | null }>;
      };
    };
  };

  const existingId = lookupJson.data?.customers?.nodes?.[0]?.id;
  if (existingId) {
    return existingId;
  }

  const createResponse = await admin.graphql(CREATE_CUSTOMER_MUTATION, {
    variables: {
      input: {
        email,
        emailMarketingConsent: {
          marketingState: "NOT_SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN",
        },
      },
    },
  });

  const createJson = (await createResponse.json()) as {
    data?: {
      customerCreate?: {
        customer?: { id?: string | null } | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
  };

  return createJson.data?.customerCreate?.customer?.id ?? null;
}

async function resolveCollectionId(
  admin: AdminGraphqlClient,
  handle: string,
): Promise<string | null> {
  const trimmed = handle.trim();
  if (!trimmed) {
    return null;
  }

  const response = await admin.graphql(COLLECTION_BY_HANDLE_QUERY, {
    variables: { handle: trimmed },
  });
  const json = (await response.json()) as {
    data?: { collectionByHandle?: { id?: string | null } | null };
  };

  return json.data?.collectionByHandle?.id ?? null;
}

function buildCreditEmail(input: {
  discountCode: string;
  amount: string;
  expiresAt: Date;
  shopName: string;
}) {
  const expiryLabel = input.expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const subject = `Your ${input.amount} gown hire credit from ${input.shopName}`;
  const bodyText = `Thanks for your try-on appointment with ${input.shopName}.

Your single-use hire credit code is: ${input.discountCode}
Value: $${input.amount} off your next gown hire
Expires: ${expiryLabel}

Enter this code at checkout when booking a gown hire. The code is tied to your customer account and can only be used once.

Kind regards,
${input.shopName}`;

  const bodyHtml = bodyText
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return { subject, bodyText, bodyHtml };
}

async function sendTryOnCreditEmail(
  shop: string,
  email: string,
  discountCode: string,
  amount: Prisma.Decimal,
  expiresAt: Date,
) {
  const shopConfig = await getShopConfig(shop);
  const shopName = shop.replace(/\.myshopify\.com$/i, "");
  const emailContent = buildCreditEmail({
    discountCode,
    amount: amount.toFixed(2),
    expiresAt,
    shopName,
  });

  return sendNotificationEmail(shop, {
    to: email,
    subject: emailContent.subject,
    bodyHtml: emailContent.bodyHtml,
    bodyText: emailContent.bodyText,
    fromName: shopConfig.notifications.fromName || shopName,
    fromEmail: shopConfig.notifications.fromEmail,
    replyTo: shopConfig.notifications.replyToEmail || undefined,
  });
}

async function deactivateShopifyDiscount(
  admin: AdminGraphqlClient,
  shopifyDiscountId: string | null,
) {
  if (!shopifyDiscountId) {
    return;
  }

  const response = await admin.graphql(DEACTIVATE_DISCOUNT_MUTATION, {
    variables: { id: shopifyDiscountId },
  });
  const json = (await response.json()) as {
    data?: {
      discountCodeDeactivate?: {
        userErrors?: Array<{ message?: string }>;
      };
    };
  };

  const userErrors = json.data?.discountCodeDeactivate?.userErrors ?? [];
  if (userErrors.length) {
    console.warn(
      `[try-on-credit] Could not deactivate discount ${shopifyDiscountId}: ${userErrors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
}

export async function issueTryOnCreditForOrder(
  admin: AdminGraphqlClient,
  shop: string,
  orderId: string,
  orderEmail: string | null | undefined,
  financialStatus: string | null | undefined,
  lineItems: OrderLineItem[],
): Promise<{ issued: number; skipped: number }> {
  const shopConfig = await getShopConfig(shop);
  if (!shopConfig.appointment.creditEnabled) {
    return { issued: 0, skipped: lineItems.length };
  }

  if (financialStatus && financialStatus !== "paid") {
    return { issued: 0, skipped: lineItems.length };
  }

  const email = orderEmail?.trim().toLowerCase();
  if (!email) {
    return { issued: 0, skipped: lineItems.length };
  }

  const customerId = await resolveCustomerId(admin, email);
  const collectionId = await resolveCollectionId(
    admin,
    shopConfig.appointment.creditRedemptionCollectionHandle,
  );

  let issued = 0;
  let skipped = 0;

  for (const lineItem of lineItems) {
    if (!isAppointmentLineItem(lineItem)) {
      continue;
    }

    const parsed = parseAppointmentLineItem(lineItem);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.tryOnCredit.findUnique({
      where: { appointmentId: parsed.appointmentId },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const amount = parseAmount(lineItem.price);
    if (!amount || amount.lte(0)) {
      skipped += 1;
      continue;
    }

    const discountCode = generateDiscountCode(parsed.appointmentId);
    const expiresAt = new Date();
    expiresAt.setUTCDate(
      expiresAt.getUTCDate() + Math.max(shopConfig.appointment.creditExpiryDays, 1),
    );

    const customerSelection = customerId
      ? { customers: { add: [customerId] } }
      : { all: true };

    const items = collectionId
      ? { collections: { add: [collectionId] } }
      : { all: true };

    const discountResponse = await admin.graphql(CREATE_DISCOUNT_MUTATION, {
      variables: {
        basicCodeDiscount: {
          title: `Try-on credit ${discountCode}`,
          code: discountCode,
          startsAt: new Date().toISOString(),
          endsAt: expiresAt.toISOString(),
          usageLimit: 1,
          appliesOncePerCustomer: true,
          customerSelection,
          customerGets: {
            value: {
              discountAmount: {
                amount: amount.toFixed(2),
                appliesOnEachItem: false,
              },
            },
            items,
          },
        },
      },
    });

    const discountJson = (await discountResponse.json()) as {
      data?: {
        discountCodeBasicCreate?: {
          codeDiscountNode?: { id?: string | null } | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const userErrors = discountJson.data?.discountCodeBasicCreate?.userErrors ?? [];
    if (discountJson.errors?.length || userErrors.length) {
      const message =
        discountJson.errors?.map((error) => error.message).join("; ") ||
        userErrors.map((error) => error.message).join("; ");
      console.warn(`[try-on-credit] Could not create discount for ${shop}: ${message}`);
      skipped += 1;
      continue;
    }

    const shopifyDiscountId =
      discountJson.data?.discountCodeBasicCreate?.codeDiscountNode?.id ?? null;

    await prisma.tryOnCredit.create({
      data: {
        shop,
        orderId,
        appointmentId: parsed.appointmentId,
        customerEmail: email,
        shopifyCustomerId: customerId,
        discountCode,
        shopifyDiscountId,
        amount,
        expiresAt,
        status: "active",
      },
    });

    await sendTryOnCreditEmail(shop, email, discountCode, amount, expiresAt);

    const orderGid = orderId.startsWith("gid://")
      ? orderId
      : `gid://shopify/Order/${orderId}`;

    await admin.graphql(UPDATE_ORDER_NOTE_MUTATION, {
      variables: {
        id: orderGid,
        note: `Try-on hire credit issued: ${discountCode} ($${amount.toFixed(2)} off gown hire, expires ${expiresAt.toISOString().slice(0, 10)}). Emailed to ${email}.`,
      },
    });

    issued += 1;
  }

  return { issued, skipped };
}

export async function voidTryOnCreditsForOrder(
  shop: string,
  orderId: string,
  admin?: AdminGraphqlClient,
) {
  const credits = await prisma.tryOnCredit.findMany({
    where: { shop, orderId, status: "active" },
  });

  if (admin) {
    for (const credit of credits) {
      await deactivateShopifyDiscount(admin, credit.shopifyDiscountId);
    }
  }

  await prisma.tryOnCredit.updateMany({
    where: { shop, orderId, status: "active" },
    data: { status: "void" },
  });

  return credits.length;
}
