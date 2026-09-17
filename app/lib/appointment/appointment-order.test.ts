import { describe, expect, it } from "vitest";

import {
  isAppointmentLineItem,
  parseAppointmentLineItem,
} from "./appointment-order.server";

describe("appointment order parsing", () => {
  it("detects appointment line items", () => {
    expect(
      isAppointmentLineItem({
        properties: [{ name: "Appointment Date", value: "7 September 2026" }],
      }),
    ).toBe(true);
  });

  it("parses appointment metadata from line properties", () => {
    const parsed = parseAppointmentLineItem({
      properties: [
        { name: "_gk_appointment_id", value: "appt-1" },
        { name: "Appointment Date", value: "2026-09-07" },
        { name: "_gk_appointment_time", value: "10:00" },
        { name: "_gk_appointment_duration", value: "50" },
      ],
    });

    expect(parsed).toEqual({
      appointmentId: "appt-1",
      date: new Date(Date.UTC(2026, 8, 7)),
      time: "10:00",
      durationMinutes: 50,
    });
  });
});
