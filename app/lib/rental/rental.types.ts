export const RENTAL_WORKFLOW_STATUSES = [
  "reserved",
  "confirmed",
  "packed",
  "dispatched",
  "returned",
  "cancelled",
] as const;

export type RentalWorkflowStatus = (typeof RENTAL_WORKFLOW_STATUSES)[number];

export const RENTAL_STATUS_LABELS: Record<RentalWorkflowStatus, string> = {
  reserved: "Reserved",
  confirmed: "Confirmed",
  packed: "Packed",
  dispatched: "Dispatched",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const RENTAL_STATUS_TONES: Record<
  RentalWorkflowStatus,
  "info" | "success" | "warning" | "critical" | "neutral"
> = {
  reserved: "info",
  confirmed: "success",
  packed: "warning",
  dispatched: "warning",
  returned: "neutral",
  cancelled: "critical",
};

export type RentalDateField = "dateCreated" | "rentalStart" | "rentalEnd";

export type RentalDatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "last3Months"
  | "last6Months"
  | "custom";

export type RentalListSort =
  | "dateCreated_desc"
  | "dateCreated_asc"
  | "rentalStart_desc"
  | "rentalStart_asc"
  | "rentalEnd_desc"
  | "rentalEnd_asc";

export type RentalListView = "card" | "table";

export type ShopifyOrderMode = "none" | "draft" | "pending" | "paid";

export type DeliveryAddress = {
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
};

export type RentalListItem = {
  id: string;
  workflowStatus: RentalWorkflowStatus;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  productTitle: string | null;
  productId: string;
  variantId: string;
  size: string;
  deliveryMethod: string;
  rentalStart: string;
  rentalEnd: string;
  eventDate: string;
  orderId: string | null;
  pricePaid: string | null;
  bufferBeforeDays: number | null;
  bufferAfterDays: number | null;
  createdAt: string;
  tags: string[];
};

export type RentalListFilters = {
  search?: string;
  workflowStatus?: RentalWorkflowStatus | "all";
  deliveryMethod?: string;
  productId?: string;
  customerEmail?: string;
  dateField?: RentalDateField;
  datePreset?: RentalDatePreset;
  dateFrom?: string;
  dateTo?: string;
  sort?: RentalListSort;
  showBuffers?: boolean;
  view?: RentalListView;
  page?: number;
  pageSize?: number;
};

export function parseWorkflowStatus(value: string | null): RentalWorkflowStatus | "all" {
  if (!value || value === "all") {
    return "all";
  }
  return RENTAL_WORKFLOW_STATUSES.includes(value as RentalWorkflowStatus)
    ? (value as RentalWorkflowStatus)
    : "all";
}

export function parseRentalSort(value: string | null): RentalListSort {
  const sorts: RentalListSort[] = [
    "dateCreated_desc",
    "dateCreated_asc",
    "rentalStart_desc",
    "rentalStart_asc",
    "rentalEnd_desc",
    "rentalEnd_asc",
  ];
  return sorts.includes(value as RentalListSort)
    ? (value as RentalListSort)
    : "dateCreated_desc";
}

export function parseDateField(value: string | null): RentalDateField {
  if (value === "rentalStart" || value === "rentalEnd") {
    return value;
  }
  return "dateCreated";
}

export function parseDatePreset(value: string | null): RentalDatePreset {
  const presets: RentalDatePreset[] = [
    "today",
    "yesterday",
    "last7",
    "thisMonth",
    "lastMonth",
    "last3Months",
    "last6Months",
    "custom",
  ];
  return presets.includes(value as RentalDatePreset)
    ? (value as RentalDatePreset)
    : "last3Months";
}

export function parseListView(value: string | null): RentalListView {
  return value === "table" ? "table" : "card";
}

export function emptyDeliveryAddress(): DeliveryAddress {
  return {
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "",
  };
}

export function parseTags(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // fall through to comma-separated
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags.filter(Boolean));
}
