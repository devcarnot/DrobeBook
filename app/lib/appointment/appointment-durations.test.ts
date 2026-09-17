import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPOINTMENT_DURATIONS,
  normalizeAppointmentDurations,
  parseAppointmentDurationMinutes,
} from "./appointment-durations";

describe("appointment durations", () => {
  it("keeps three default durations", () => {
    expect(normalizeAppointmentDurations(undefined)).toHaveLength(3);
    expect(normalizeAppointmentDurations(undefined)).toEqual(
      DEFAULT_APPOINTMENT_DURATIONS,
    );
  });

  it("accepts custom configured durations", () => {
    expect(
      normalizeAppointmentDurations([
        { minutes: 45, label: "45 minute VIP appointment" },
        { minutes: 15, label: "Quick try-on" },
      ]),
    ).toEqual([
      { minutes: 45, label: "45 minute VIP appointment" },
      { minutes: 15, label: "Quick try-on" },
    ]);
  });

  it("parses configured duration minutes", () => {
    expect(parseAppointmentDurationMinutes("30", [30, 45])).toBe(30);
    expect(parseAppointmentDurationMinutes("50 minute Appointment", [50, 30])).toBe(
      50,
    );
  });
});
