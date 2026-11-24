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
    automaticDiscountNodes(first: 20) {
      nodes {
        id
        automaticDiscount {
          ... on DiscountAutomaticApp {
            title
          }
        }
      }
    }
  }
`;

const DISCOUNT_TITLE = "DrobeBook backup dress hire";

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function ensureBackupDressAutomaticDiscount(
  admin: AdminGraphql,
  functionId: string,
): Promise<void> {
  if (!functionId) {
    return;
  }

  const listResponse = await admin.graphql(LIST_AUTOMATIC_APP_DISCOUNTS);
  const listJson = (await listResponse.json()) as {
    data?: {
      automaticDiscountNodes?: {
        nodes?: Array<{
          automaticDiscount?: { title?: string | null } | null;
        }>;
      };
    };
  };

  const exists = (listJson.data?.automaticDiscountNodes?.nodes ?? []).some(
    (node) => node.automaticDiscount?.title === DISCOUNT_TITLE,
  );

  if (exists) {
    return;
  }

  const response = await admin.graphql(CREATE_AUTOMATIC_APP_DISCOUNT, {
    variables: {
      functionId,
      title: DISCOUNT_TITLE,
    },
  });

  const json = (await response.json()) as {
  data?: {
      discountAutomaticAppCreate?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const userErrors = json.data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    console.warn(
      "[backup-dress-discount] Could not create automatic discount:",
      json.errors?.map((error) => error.message).join("; ") ||
        userErrors.map((error) => error.message).join("; "),
    );
  }
}