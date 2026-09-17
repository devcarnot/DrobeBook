import { formatShopifyAccessError, isProtectedCustomerDataError } from "../shopify-access.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type RentalCustomerOption = {
  id: string;
  legacyId: string;
  name: string;
  email: string;
};

const CUSTOMER_PAGE_SIZE = 250;
const DEFAULT_CUSTOMER_LIMIT = 250;

const CUSTOMERS_FOR_PICKER_QUERY = `#graphql
  query RentalCustomersForPicker($first: Int!, $query: String, $after: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        legacyResourceId
        displayName
        firstName
        lastName
        defaultEmailAddress {
          emailAddress
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function formatCustomerName(customer: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const displayName = customer.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  return [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
}

function extractCustomerEmail(customer: {
  email?: string | null;
  defaultEmailAddress?: { emailAddress?: string | null } | null;
}) {
  return (
    customer.defaultEmailAddress?.emailAddress?.trim() ||
    customer.email?.trim() ||
    ""
  );
}

function mapCustomerNode(customer: {
  id?: string;
  legacyResourceId?: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  defaultEmailAddress?: { emailAddress?: string | null } | null;
}): RentalCustomerOption | null {
  if (!customer.id) {
    return null;
  }

  const legacyId = customer.legacyResourceId ?? customer.id.split("/").pop()!;
  return {
    id: customer.id,
    legacyId,
    name: formatCustomerName(customer) || "Customer",
    email: extractCustomerEmail(customer),
  };
}

export class CustomerAccessError extends Error {
  requiresProtectedCustomerData: boolean;

  constructor(message: string) {
    super(formatShopifyAccessError(message));
    this.name = "CustomerAccessError";
    this.requiresProtectedCustomerData = isProtectedCustomerDataError(message);
  }
}

export async function listCustomersForPicker(
  admin: AdminGraphqlClient,
  options: { query?: string | null; limit?: number } = {},
): Promise<RentalCustomerOption[]> {
  const maxResults = Math.min(
    Math.max(options.limit ?? DEFAULT_CUSTOMER_LIMIT, 1),
    DEFAULT_CUSTOMER_LIMIT,
  );
  const search = options.query?.trim();
  const customers: RentalCustomerOption[] = [];
  let after: string | undefined;

  while (customers.length < maxResults) {
    const first = Math.min(CUSTOMER_PAGE_SIZE, maxResults - customers.length);
    const response = await admin.graphql(CUSTOMERS_FOR_PICKER_QUERY, {
      variables: {
        first,
        query: search || undefined,
        after,
      },
    });

    const json = (await response.json()) as {
      data?: {
        customers?: {
          nodes?: Array<{
            id?: string;
            legacyResourceId?: string;
            displayName?: string | null;
            firstName?: string | null;
            lastName?: string | null;
            email?: string | null;
            defaultEmailAddress?: { emailAddress?: string | null } | null;
          }>;
          pageInfo?: {
            hasNextPage?: boolean;
            endCursor?: string | null;
          };
        };
      };
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length) {
      throw new CustomerAccessError(
        json.errors.map((error) => error.message).join("; "),
      );
    }

    const page = json.data?.customers;
    for (const node of page?.nodes ?? []) {
      const mapped = mapCustomerNode(node);
      if (mapped) {
        customers.push(mapped);
      }
    }

    if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) {
      break;
    }

    after = page.pageInfo.endCursor;
  }

  return customers;
}
