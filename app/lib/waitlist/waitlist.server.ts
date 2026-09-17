import prisma from "../../db.server";
import { parseIsoDate } from "../booking/availability.server";
import { extractNumericId, shopifyAdminProductUrl } from "../shopify-ids";
import {
  getWaitlistDemandByProduct,
  type WaitlistDemandRow,
} from "./waitlist-notify.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PRODUCTS_BY_IDS_QUERY = `#graphql
  query WaitlistProductsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
      }
    }
  }
`;

export type WaitlistCreateInput = {
  shop: string;
  productId: string;
  productTitle?: string | null;
  variantId?: string | null;
  size?: string | null;
  eventDate?: string | null;
  email: string;
  name?: string | null;
  notes?: string | null;
};

export type WaitlistStatus = "waiting" | "contacted" | "fulfilled";

export type WaitlistEntryView = {
  id: string;
  shop: string;
  productId: string;
  productTitle: string;
  productHandle: string | null;
  variantId: string | null;
  size: string | null;
  eventDate: Date | null;
  email: string;
  name: string | null;
  notes: string | null;
  status: WaitlistStatus;
  notifiedAt: Date | null;
  claimExpiresAt: Date | null;
  claimStorefrontUrl: string | null;
  createdAt: Date;
  adminProductUrl: string;
  storefrontProductUrl: string | null;
  mailtoUrl: string;
};

export type WaitlistSummary = {
  total: number;
  waiting: number;
  contacted: number;
  fulfilled: number;
};

export async function createWaitlistEntry(input: WaitlistCreateInput) {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  const productId = input.productId.trim();
  if (!productId) {
    throw new Error("Product is required.");
  }

  const eventDate = input.eventDate ? parseIsoDate(input.eventDate) : null;

  return prisma.waitlistEntry.create({
    data: {
      shop: input.shop,
      productId,
      productTitle: input.productTitle?.trim() || null,
      variantId: input.variantId?.trim() || null,
      size: input.size?.trim() || null,
      eventDate,
      email,
      name: input.name?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "waiting",
    },
  });
}

export async function listWaitlistEntries(shop: string, status?: WaitlistStatus | "all") {
  return prisma.waitlistEntry.findMany({
    where: {
      shop,
      ...(status && status !== "all" ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getWaitlistSummary(shop: string): Promise<WaitlistSummary> {
  const grouped = await prisma.waitlistEntry.groupBy({
    by: ["status"],
    where: { shop },
    _count: { _all: true },
  });

  const counts = {
    waiting: 0,
    contacted: 0,
    fulfilled: 0,
  };

  for (const row of grouped) {
    if (row.status === "waiting") {
      counts.waiting = row._count._all;
    } else if (row.status === "contacted") {
      counts.contacted = row._count._all;
    } else if (row.status === "fulfilled") {
      counts.fulfilled = row._count._all;
    }
  }

  return {
    total: counts.waiting + counts.contacted + counts.fulfilled,
    ...counts,
  };
}

async function resolveProductDetails(
  shop: string,
  admin: AdminGraphqlClient,
  productIds: string[],
): Promise<Map<string, { title: string; handle: string | null }>> {
  const uniqueIds = [...new Set(productIds.map((id) => extractNumericId(id)))];
  const details = new Map<string, { title: string; handle: string | null }>();

  if (uniqueIds.length === 0) {
    return details;
  }

  const rentalProducts = await prisma.rentalProduct.findMany({
    where: {
      shop,
      shopifyProductId: { in: uniqueIds },
    },
    select: {
      shopifyProductId: true,
      title: true,
      handle: true,
    },
  });

  for (const product of rentalProducts) {
    details.set(product.shopifyProductId, {
      title: product.title,
      handle: product.handle,
    });
  }

  const missingIds = uniqueIds.filter((id) => !details.has(id));
  if (missingIds.length === 0) {
    return details;
  }

  const response = await admin.graphql(PRODUCTS_BY_IDS_QUERY, {
    variables: {
      ids: missingIds.map((id) => `gid://shopify/Product/${id}`),
    },
  });

  const json = (await response.json()) as {
    data?: {
      nodes?: Array<{
        id?: string;
        title?: string;
        handle?: string;
      } | null>;
    };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    console.warn(
      "[waitlist] Could not resolve some product titles:",
      json.errors.map((error) => error.message).join("; "),
    );
  }

  for (const node of json.data?.nodes ?? []) {
    if (!node?.id || !node.title) {
      continue;
    }

    details.set(extractNumericId(node.id), {
      title: node.title,
      handle: node.handle ?? null,
    });
  }

  return details;
}

function buildClaimStorefrontUrl(
  shop: string,
  productHandle: string | null,
  claimToken: string | null,
) {
  if (!productHandle || !claimToken) {
    return null;
  }

  return `https://${shop}/products/${productHandle}?gk_claim=${encodeURIComponent(claimToken)}`;
}

function buildMailtoUrl(entry: {
  email: string;
  productTitle: string;
  size: string | null;
  eventDate: Date | null;
  notes: string | null;
  claimStorefrontUrl?: string | null;
  claimExpiresAt?: Date | null;
}) {
  const eventText = entry.eventDate
    ? entry.eventDate.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "your event";

  const subject = `Good news about ${entry.productTitle} — GK.Drobe waitlist`;
  const body = [
    "Hi there,",
    "",
    `Thank you for joining the waitlist for ${entry.productTitle}${entry.size ? ` (size ${entry.size})` : ""}.`,
    entry.eventDate ? `We noted your event date: ${eventText}.` : "",
    "",
    entry.claimStorefrontUrl
      ? `You have priority access to book for the next ${formatClaimWindow(entry.claimExpiresAt)}. Use this exclusive link:\n${entry.claimStorefrontUrl}`
      : "We now have availability that may work for your hire dates. Reply to this email or book online when you're ready.",
    entry.notes ? `\nYour note: ${entry.notes}` : "",
    "",
    "Kind regards,",
    "GK.Drobe",
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:${encodeURIComponent(entry.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function formatClaimWindow(claimExpiresAt: Date | null | undefined) {
  if (!claimExpiresAt) {
    return "48 hours";
  }

  const hours = Math.max(
    1,
    Math.round((claimExpiresAt.getTime() - Date.now()) / (60 * 60 * 1000)),
  );
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export async function getWaitlistPageData(
  shop: string,
  admin: AdminGraphqlClient,
  options: { status?: WaitlistStatus | "all" } = {},
) {
  const [entries, summary] = await Promise.all([
    listWaitlistEntries(shop, options.status),
    getWaitlistSummary(shop),
  ]);

  const productDetails = await resolveProductDetails(
    shop,
    admin,
    entries.map((entry) => entry.productId),
  );

  const enriched: WaitlistEntryView[] = entries.map((entry) => {
    const productId = extractNumericId(entry.productId);
    const resolved = productDetails.get(productId);
    const productTitle =
      entry.productTitle?.trim() ||
      resolved?.title ||
      `Product ${productId}`;
    const productHandle = resolved?.handle ?? null;

    const claimStorefrontUrl = buildClaimStorefrontUrl(
      shop,
      productHandle,
      entry.claimToken,
    );

    const view = {
      id: entry.id,
      shop: entry.shop,
      productId,
      productTitle,
      productHandle,
      variantId: entry.variantId,
      size: entry.size,
      eventDate: entry.eventDate,
      email: entry.email,
      name: entry.name,
      notes: entry.notes,
      status: entry.status as WaitlistStatus,
      notifiedAt: entry.notifiedAt,
      claimExpiresAt: entry.claimExpiresAt,
      claimStorefrontUrl,
      createdAt: entry.createdAt,
      adminProductUrl: shopifyAdminProductUrl(shop, productId),
      storefrontProductUrl: productHandle
        ? `https://${shop}/products/${productHandle}`
        : null,
      mailtoUrl: "",
    };

    view.mailtoUrl = buildMailtoUrl(view);
    return view;
  });

  const demand = await getWaitlistDemandByProduct(shop);

  return { entries: enriched, summary, demand };
}

export type { WaitlistDemandRow };

export function waitlistEntriesToCsv(entries: WaitlistEntryView[]): string {
  const header = [
    "Email",
    "Name",
    "Status",
    "Product ID",
    "Product title",
    "Size",
    "Event date",
    "Notes",
    "Submitted",
  ];

  const rows = entries.map((entry) => [
    entry.email,
    entry.name ?? "",
    entry.status,
    entry.productId,
    entry.productTitle,
    entry.size ?? "",
    entry.eventDate
      ? entry.eventDate.toISOString().slice(0, 10)
      : "",
    entry.notes ?? "",
    entry.createdAt.toISOString(),
  ]);

  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export async function updateWaitlistStatus(
  shop: string,
  id: string,
  status: WaitlistStatus,
) {
  return prisma.waitlistEntry.updateMany({
    where: { shop, id },
    data: { status },
  });
}

export async function fulfillWaitlistForBooking(
  shop: string,
  productId: string,
  variantId: string,
  customerEmail: string | null | undefined,
) {
  const email = customerEmail?.trim().toLowerCase();
  if (!email) {
    return;
  }

  await prisma.waitlistEntry.updateMany({
    where: {
      shop,
      productId,
      email,
      OR: [{ variantId }, { variantId: null }],
      status: { in: ["waiting", "contacted"] },
    },
    data: {
      status: "fulfilled",
      claimToken: null,
      claimExpiresAt: null,
    },
  });
}
