const CREATE_AUTOMATIC_APP_DISCOUNT = `#graphql
  mutation CreateBackupDressAutomaticDiscount(
    $functionId: String!
    $title: String!
  ) {
    discountAutomaticAppCreate(
      automaticAppDiscount: {
        title: $title
        functionId: $functionId
        startsAt: "2020-01-01T00:00:00Z"
        combinesWith: {
          orderDiscounts: false
          productDiscounts: true
          shippingDiscounts: true
        }
      }
    ) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_AUTOMATIC_APP_DISCOUNTS = `#graphql
  query ListAutomaticAppDiscounts {
    automaticDiscountNodes(first: 25) {
      nodes {
        id
        automaticDiscount {
          ... on DiscountAutomaticApp {
            title
            status
            discountId
          }
        }
      }
    }
  }
`;

const ACTIVATE_AUTOMATIC_DISCOUNT = `#graphql
  mutation ActivateAutomaticDiscount($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FIND_SHOPIFY_FUNCTIONS = `#graphql
  query FindShopifyFunctions {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
      }
    }
  }
`;

import { BACKUP_DRESS_DISCOUNT_TITLE } from "./backup-dress-discount";

const BACKUP_FUNCTION_TITLE_HINT = "backup dress";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type BackupDressDiscountStatus = {
  functionId: string | null;
  functionTitle: string | null;
  discountNodeId: string | null;
  discountTitle: string | null;
  discountStatus: string | null;
  active: boolean;
};

function pickUserErrors(
  userErrors: Array<{ message: string }> | undefined,
  errors: Array<{ message: string }> | undefined,
): string[] {
  return [
    ...(errors ?? []).map((error) => error.message),
    ...(userErrors ?? []).map((error) => error.message),
  ].filter(Boolean);
}

export async function resolveBackupDressFunctionId(
  admin: AdminGraphql,
): Promise<{ id: string | null; title: string | null }> {
  const envId = process.env.BACKUP_DRESS_FUNCTION_ID?.trim();
  if (envId) {
    return { id: envId, title: "Backup dress hire discount (env)" };
  }

  const response = await admin.graphql(FIND_SHOPIFY_FUNCTIONS);
  const json = (await response.json()) as {
    data?: {
      shopifyFunctions?: {
        nodes?: Array<{
          id: string;
          title?: string | null;
          apiType?: string | null;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  const nodes = json.data?.shopifyFunctions?.nodes ?? [];
  const match =
    nodes.find((node) =>
      String(node.title ?? "")
        .toLowerCase()
        .includes(BACKUP_FUNCTION_TITLE_HINT),
    ) ??
    nodes.find((node) =>
      String(node.apiType ?? "").includes("purchase.product-discount"),
    );

  return {
    id: match?.id ?? null,
    title: match?.title ?? null,
  };
}

export async function getBackupDressDiscountStatus(
  admin: AdminGraphql,
): Promise<BackupDressDiscountStatus> {
  const { id: functionId, title: functionTitle } =
    await resolveBackupDressFunctionId(admin);

  const listResponse = await admin.graphql(LIST_AUTOMATIC_APP_DISCOUNTS);
  const listJson = (await listResponse.json()) as {
    data?: {
      automaticDiscountNodes?: {
        nodes?: Array<{
          id: string;
          automaticDiscount?: {
            title?: string | null;
            status?: string | null;
            discountId?: string | null;
          } | null;
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (listJson.errors?.length) {
    throw new Error(listJson.errors.map((error) => error.message).join("; "));
  }

  const discountNode = (listJson.data?.automaticDiscountNodes?.nodes ?? []).find(
    (node) =>
      node.automaticDiscount?.title === BACKUP_DRESS_DISCOUNT_TITLE ||
      String(node.automaticDiscount?.title ?? "")
        .toLowerCase()
        .includes(BACKUP_FUNCTION_TITLE_HINT),
  );

  const status = discountNode?.automaticDiscount?.status ?? null;

  return {
    functionId,
    functionTitle,
    discountNodeId: discountNode?.id ?? null,
    discountTitle: discountNode?.automaticDiscount?.title ?? null,
    discountStatus: status,
    active: status === "ACTIVE",
  };
}

export type EnsureBackupDressDiscountResult = {
  ok: boolean;
  created: boolean;
  activated: boolean;
  discountNodeId: string | null;
  errors: string[];
};

export async function ensureBackupDressAutomaticDiscount(
  admin: AdminGraphql,
  functionId?: string | null,
): Promise<EnsureBackupDressDiscountResult> {
  const resolved =
    functionId?.trim() ||
    (await resolveBackupDressFunctionId(admin)).id ||
    "";

  if (!resolved) {
    return {
      ok: false,
      created: false,
      activated: false,
      discountNodeId: null,
      errors: [
        "Shopify function not found. Deploy the app extension (gown-backup-discount), then open this page again.",
      ],
    };
  }

  const status = await getBackupDressDiscountStatus(admin);

  if (status.discountNodeId && status.active) {
    return {
      ok: true,
      created: false,
      activated: false,
      discountNodeId: status.discountNodeId,
      errors: [],
    };
  }

  if (status.discountNodeId && !status.active) {
    const activateResponse = await admin.graphql(ACTIVATE_AUTOMATIC_DISCOUNT, {
      variables: { id: status.discountNodeId },
    });
    const activateJson = (await activateResponse.json()) as {
      data?: {
        discountAutomaticActivate?: {
          automaticDiscountNode?: { id: string } | null;
          userErrors?: Array<{ message: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    const errors = pickUserErrors(
      activateJson.data?.discountAutomaticActivate?.userErrors,
      activateJson.errors,
    );

    return {
      ok: errors.length === 0,
      created: false,
      activated: errors.length === 0,
      discountNodeId:
        activateJson.data?.discountAutomaticActivate?.automaticDiscountNode
          ?.id ?? status.discountNodeId,
      errors,
    };
  }

  const response = await admin.graphql(CREATE_AUTOMATIC_APP_DISCOUNT, {
    variables: {
      functionId: resolved,
      title: BACKUP_DRESS_DISCOUNT_TITLE,
    },
  });

  const json = (await response.json()) as {
    data?: {
      discountAutomaticAppCreate?: {
        automaticAppDiscount?: { discountId?: string | null } | null;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const errors = pickUserErrors(
    json.data?.discountAutomaticAppCreate?.userErrors,
    json.errors,
  );

  if (errors.length) {
    return {
      ok: false,
      created: false,
      activated: false,
      discountNodeId: null,
      errors,
    };
  }

  const afterCreate = await getBackupDressDiscountStatus(admin);
  if (afterCreate.discountNodeId && !afterCreate.active) {
    return ensureBackupDressAutomaticDiscount(admin, resolved);
  }

  return {
    ok: true,
    created: true,
    activated: afterCreate.active,
    discountNodeId: afterCreate.discountNodeId,
    errors: [],
  };
}