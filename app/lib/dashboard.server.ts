import prisma from "../db.server";
import {
  DEFAULT_BUFFER_CONFIG,
  type BufferConfig,
} from "./booking/buffer-config";
import {
  DEFAULT_ONBOARDING_CONFIG,
  type OnboardingConfig,
  type RentalDurationMode,
} from "./shop-config";
import {
  DEFAULT_WIDGET_CONFIG,
} from "./shop-settings";
import { getShopConfig, saveShopConfig } from "./shop-settings.server";

export type DashboardStats = {
  bookingCount: number;
  upcomingBookingCount: number;
  blockedDateCount: number;
  hasSavedSettings: boolean;
  damageProtectionConfigured: boolean;
  widgetTextsCustomized: boolean;
};

export type DashboardPageData = DashboardStats & {
  importedProductCount: number;
  rentalEnabledProductCount: number;
  firstRentalProductTitle: string | null;
  firstRentalProductShopifyId: string | null;
  firstRentalProductHandle: string | null;
  onboarding: OnboardingConfig;
  buffersConfigured: boolean;
  storefrontConfigured: boolean;
  storeHandle: string;
  quickstartCompletedCount: number;
  quickstartTotal: number;
};

const QUICKSTART_TOTAL = 4;

function buffersDifferFromDefault(buffers: BufferConfig): boolean {
  return JSON.stringify(buffers) !== JSON.stringify(DEFAULT_BUFFER_CONFIG);
}

function buildQuickstartCompletion(input: {
  onboarding: OnboardingConfig;
  rentalEnabledProductCount: number;
  storefrontConfigured: boolean;
}): number {
  let completed = 0;

  if (input.onboarding.durationModeConfirmed) {
    completed += 1;
  }
  if (input.rentalEnabledProductCount > 0) {
    completed += 1;
  }
  if (input.storefrontConfigured) {
    completed += 1;
  }
  if (input.rentalEnabledProductCount > 0 && input.storefrontConfigured) {
    completed += 1;
  }

  return completed;
}

export async function getDashboardPageData(shop: string): Promise<DashboardPageData> {
  const now = new Date();

  const [
    bookingCount,
    upcomingBookingCount,
    blockedDateCount,
    importedProductCount,
    rentalEnabledProductCount,
    firstRentalProduct,
    shopConfig,
  ] = await Promise.all([
    prisma.booking.count({ where: { shop } }),
    prisma.booking.count({
      where: {
        shop,
        status: { not: "cancelled" },
        startDate: { gte: now },
      },
    }),
    prisma.blockedDate.count({ where: { shop } }),
    prisma.rentalProduct.count({
      where: { shop, removedAt: null },
    }),
    prisma.rentalProduct.count({
      where: { shop, removedAt: null, rentalEnabled: true },
    }),
    prisma.rentalProduct.findFirst({
      where: { shop, removedAt: null, rentalEnabled: true },
      orderBy: { updatedAt: "desc" },
      select: {
        title: true,
        shopifyProductId: true,
        handle: true,
      },
    }),
    getShopConfig(shop),
  ]);

  const config = shopConfig.widget;
  const onboarding = shopConfig.onboarding ?? { ...DEFAULT_ONBOARDING_CONFIG };
  const widgetTextsCustomized =
    config.deliveryInstructions !== DEFAULT_WIDGET_CONFIG.deliveryInstructions ||
    config.postageNote !== DEFAULT_WIDGET_CONFIG.postageNote ||
    config.pickupLabel !== DEFAULT_WIDGET_CONFIG.pickupLabel ||
    config.postLabel !== DEFAULT_WIDGET_CONFIG.postLabel;
  const buffersConfigured = buffersDifferFromDefault(shopConfig.buffers);
  const storefrontConfigured =
    buffersConfigured ||
    Boolean(config.damageProtectionVariantId) ||
    widgetTextsCustomized;

  const quickstartCompletedCount = buildQuickstartCompletion({
    onboarding,
    rentalEnabledProductCount,
    storefrontConfigured,
  });

  return {
    bookingCount,
    upcomingBookingCount,
    blockedDateCount,
    hasSavedSettings: Boolean(await prisma.shopSettings.findUnique({ where: { shop } })),
    damageProtectionConfigured: Boolean(config.damageProtectionVariantId),
    widgetTextsCustomized,
    importedProductCount,
    rentalEnabledProductCount,
    firstRentalProductTitle: firstRentalProduct?.title ?? null,
    firstRentalProductShopifyId: firstRentalProduct?.shopifyProductId ?? null,
    firstRentalProductHandle: firstRentalProduct?.handle ?? null,
    onboarding,
    buffersConfigured,
    storefrontConfigured,
    storeHandle: shop.replace(".myshopify.com", ""),
    quickstartCompletedCount,
    quickstartTotal: QUICKSTART_TOTAL,
  };
}

export async function saveRentalDurationMode(
  shop: string,
  mode: RentalDurationMode,
): Promise<OnboardingConfig> {
  const existing = await getShopConfig(shop);
  const onboarding: OnboardingConfig = {
    ...existing.onboarding,
    rentalDurationMode: mode,
    durationModeConfirmed: true,
  };

  await saveShopConfig(shop, {
    ...existing,
    onboarding,
  });

  return onboarding;
}

export async function completeOnboarding(shop: string): Promise<OnboardingConfig> {
  const existing = await getShopConfig(shop);
  const onboarding: OnboardingConfig = {
    ...existing.onboarding,
    completed: true,
  };

  await saveShopConfig(shop, {
    ...existing,
    onboarding,
  });

  return onboarding;
}

export async function resetOnboardingGuide(shop: string): Promise<OnboardingConfig> {
  const existing = await getShopConfig(shop);
  const onboarding: OnboardingConfig = {
    ...existing.onboarding,
    completed: false,
  };

  await saveShopConfig(shop, {
    ...existing,
    onboarding,
  });

  return onboarding;
}

/** @deprecated Use getDashboardPageData */
export async function getDashboardStats(shop: string): Promise<DashboardStats> {
  const data = await getDashboardPageData(shop);
  return {
    bookingCount: data.bookingCount,
    upcomingBookingCount: data.upcomingBookingCount,
    blockedDateCount: data.blockedDateCount,
    hasSavedSettings: data.hasSavedSettings,
    damageProtectionConfigured: data.damageProtectionConfigured,
    widgetTextsCustomized: data.widgetTextsCustomized,
  };
}
