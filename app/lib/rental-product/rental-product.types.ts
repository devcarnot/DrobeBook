export type RentalProductConfigStatus =
  | "setup_required"
  | "configured"
  | "rental_enabled"
  | "rental_disabled"
  | "shopify_unavailable"
  | "sync_error";

export type RentalProductImportStatus =
  | "not_imported"
  | "importing"
  | "imported"
  | "setup_required"
  | "import_failed";

export type ShopifyCatalogVariant = {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  price: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
};

export type ShopifyCatalogProduct = {
  shopifyProductId: string;
  title: string;
  handle: string;
  featuredImageUrl: string | null;
  shopifyStatus: string;
  vendor: string | null;
  productType: string | null;
  variants: ShopifyCatalogVariant[];
};

export type CatalogPage = {
  products: ShopifyCatalogProduct[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};

export type ImportProductResult = {
  shopifyProductId: string;
  title: string;
  ok: boolean;
  created: boolean;
  rentalProductId?: string;
  error?: string;
};

export type BulkImportSummary = {
  imported: number;
  updated: number;
  failed: number;
  results: ImportProductResult[];
  firstConfigureId: string | null;
};

export type RentalProductListItem = {
  id: string;
  shopifyProductId: string;
  title: string;
  handle: string;
  featuredImageUrl: string | null;
  shopifyStatus: string;
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  configStatus: RentalProductConfigStatus;
  lastSyncedAt: string | null;
  importedAt: string;
  rentalEnabled: boolean;
  isConfigured: boolean;
  syncError: string | null;
  shopifyAdminUrl: string;
  configureUrl: string;
  rentalsUrl: string;
  calendarUrl: string;
};

export const CONFIG_STATUS_LABELS: Record<RentalProductConfigStatus, string> = {
  setup_required: "Setup required",
  configured: "Configured",
  rental_enabled: "Rental enabled",
  rental_disabled: "Rental disabled",
  shopify_unavailable: "Shopify unavailable",
  sync_error: "Synchronization error",
};

export const CONFIG_STATUS_TONES: Record<
  RentalProductConfigStatus,
  "warning" | "success" | "info" | "critical" | "neutral"
> = {
  setup_required: "warning",
  configured: "info",
  rental_enabled: "success",
  rental_disabled: "neutral",
  shopify_unavailable: "critical",
  sync_error: "critical",
};
