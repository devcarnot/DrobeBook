import {
  addDays,
  computeReturnDate,
  formatDateIso,
  isProductVariantAvailable,
  meetsLeadTime,
  toDateOnly,
  type HireDurationDays,
} from "./availability";
import { checkProductAvailability, parseHireDuration } from "./availability.server";

export type CalendarAvailabilityParams = {
  shop: string;
  productId: string;
  variantId: string;
  durationDays: HireDurationDays;
  year: number;
  month: number;
  today?: Date;
};

export type CalendarAvailabilityResult = {
  year: number;
  month: number;
  earliestDeliveryDate: string;
  unavailableDates: string[];
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export async function getUnavailableDatesForMonth(
  params: CalendarAvailabilityParams,
): Promise<CalendarAvailabilityResult> {
  const today = params.today ?? new Date();
  const earliestDelivery = addDays(toDateOnly(today), 4);
  const unavailableDates: string[] = [];

  const totalDays = daysInMonth(params.year, params.month);

  for (let day = 1; day <= totalDays; day += 1) {
    const deliveryDate = new Date(
      Date.UTC(params.year, params.month - 1, day),
    );

    if (!meetsLeadTime(deliveryDate, today)) {
      unavailableDates.push(formatDateIso(deliveryDate));
      continue;
    }

    const result = await checkProductAvailability({
      shop: params.shop,
      productId: params.productId,
      variantId: params.variantId,
      deliveryDate,
      durationDays: params.durationDays,
      today,
    });

    if (!result.available) {
      unavailableDates.push(formatDateIso(deliveryDate));
    }
  }

  return {
    year: params.year,
    month: params.month,
    earliestDeliveryDate: formatDateIso(earliestDelivery),
    unavailableDates,
  };
}

export function parseCalendarMonth(
  yearParam: string | null,
  monthParam: string | null,
): { year: number; month: number } | null {
  if (!yearParam || !monthParam) {
    return null;
  }

  const year = Number.parseInt(yearParam, 10);
  const month = Number.parseInt(monthParam, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return { year, month };
}

export { parseHireDuration, isProductVariantAvailable, computeReturnDate, formatDateIso };
