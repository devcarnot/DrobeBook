// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

const BACKUP_DISCOUNT_PERCENT = 80;

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.All,
  discounts: [],
};

/**
 * @param {string | null | undefined}
 */
function normalizeToken(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {RunInput["cart"]["lines"][number]} line
 */
function isGownHireLine(line) {
  if (line.clutch?.value === "true") {
    return false;
  }
  if (line.forItem?.value && !line.deliveryDate?.value) {
    return false;
  }
  if (!line.size?.value || !line.duration?.value) {
    return false;
  }
  return Boolean(line.deliveryDate?.value && line.returnDate?.value);
}

/**
 * @param {RunInput["cart"]["lines"][number]} line
 */
function hirePeriodGroupKey(line) {
  const delivery = normalizeToken(line.deliveryDate?.value);
  const returnDate = normalizeToken(line.returnDate?.value);
  const duration = normalizeToken(line.duration?.value);
  if (!delivery || !returnDate) {
    return null;
  }
  return `${delivery}|${returnDate}|${duration}`;
}

/**
 * @param {number} total
 */
function allocateHireTierCounts(total) {
  if (total <= 0) {
    return { fullPriceCount: 0, backupCount: 0 };
  }
  return {
    fullPriceCount: Math.ceil(total / 2),
    backupCount: Math.floor(total / 2),
  };
}

/**
 * @param {string | null | undefined}
 */
function lineAmountCents(amount) {
  const parsed = Number.parseFloat(String(amount ?? "0"));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const lines = input?.cart?.lines ?? [];
  const eligible = lines.filter(isGownHireLine);

  if (!eligible.length) {
    return EMPTY_DISCOUNT;
  }

  /** @type {Map<string, typeof eligible>} */
  const groups = new Map();

  for (const line of eligible) {
    const key = hirePeriodGroupKey(line);
    if (!key) {
      continue;
    }
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }

  /** @type {Array<{ cartLine: { id: string }, quantity: number }>} */
  const targets = [];

  for (const groupLines of groups.values()) {
    const sorted = [...groupLines].sort(
      (a, b) =>
        lineAmountCents(b.cost?.amountPerQuantity?.amount) -
        lineAmountCents(a.cost?.amountPerQuantity?.amount),
    );
    const { fullPriceCount } = allocateHireTierCounts(sorted.length);

    sorted.forEach((line, index) => {
      if (index < fullPriceCount) {
        return;
      }
      targets.push({
        cartLine: { id: line.id },
        quantity: line.quantity ?? 1,
      });
    });
  }

  if (!targets.length) {
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.All,
    discounts: [
      {
        targets,
        value: {
          percentage: {
            value: String(BACKUP_DISCOUNT_PERCENT),
          },
        },
        message: "Backup dress — 80% off",
      },
    ],
  };
}