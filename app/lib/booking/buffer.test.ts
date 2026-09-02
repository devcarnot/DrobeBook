import { describe, expect, it } from "vitest";

import { addDaysByUnit, getEarliestDeliveryDate, previewBufferDates } from "./buffer";
import { DEFAULT_BUFFER_CONFIG } from "./buffer-config";
import { formatDateIso, toDateOnly } from "./availability";

const d = (iso: string) => toDateOnly(new Date(`${iso}T12:00:00.000Z`));
const holidays = new Set<string>(["2026-11-11"]);

describe("buffer calculations", () => {
  it("adds calendar days directly", () => {
    expect(formatDateIso(addDaysByUnit(d("2026-11-08"), 2, "calendar", holidays))).toBe(
      "2026-11-10",
    );
  });

  it("skips weekends and holidays for business days", () => {
    expect(
      formatDateIso(addDaysByUnit(d("2026-11-07"), 1, "business", holidays)),
    ).toBe("2026-11-09");
  });

  it("applies cut-off time before counting blocked days", () => {
    const beforeCutOff = getEarliestDeliveryDate(
      {
        ...DEFAULT_BUFFER_CONFIG.post,
        blockedDaysFromToday: 1,
        blockedDaysUnit: "calendar",
        cutOffTime: "13:00",
      },
      new Date("2026-11-07T02:00:00.000Z"),
      holidays,
    );
    expect(formatDateIso(beforeCutOff)).toBe("2026-11-08");

    const afterCutOff = getEarliestDeliveryDate(
      {
        ...DEFAULT_BUFFER_CONFIG.post,
        blockedDaysFromToday: 1,
        blockedDaysUnit: "calendar",
        cutOffTime: "13:00",
      },
      new Date("2026-11-07T06:00:00.000Z"),
      holidays,
    );
    expect(formatDateIso(afterCutOff)).toBe("2026-11-09");
  });

  it("previews start and end buffer dates for a rental", () => {
    const preview = previewBufferDates({
      rentalStart: "2026-11-08",
      rentalEnd: "2026-11-11",
      deliveryMethod: "post",
      bufferConfig: {
        post: {
          ...DEFAULT_BUFFER_CONFIG.post,
          bufferBeforeRental: 1,
          bufferBeforeUnit: "business",
          bufferAfterRental: 2,
          bufferAfterUnit: "business",
        },
        pickup: DEFAULT_BUFFER_CONFIG.pickup,
      },
      holidays,
    });

    expect(preview.startBufferDate).toBe("2026-11-06");
    expect(preview.endBufferDate).toBe("2026-11-13");
  });
});
