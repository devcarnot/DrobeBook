import { describe, expect, it } from "vitest";

import { getOccupiedRoomsForWindow, type RoomOccupancy } from "./appointment.server";

describe("cross-duration try room sync", () => {
  it("reduces spaces on overlapping 30/20 slots when a 50-min booking exists", () => {
    const occupancies: RoomOccupancy[] = [
      { time: "10:00", durationMinutes: 50, changeRoomId: "room-1" },
    ];

    const occupied50 = getOccupiedRoomsForWindow(occupancies, "10:00", 50, 3);
    const occupied30 = getOccupiedRoomsForWindow(occupancies, "10:00", 30, 3);
    const occupied20Morning = getOccupiedRoomsForWindow(
      occupancies,
      "10:00",
      20,
      3,
    );
    const occupied20Overlap = getOccupiedRoomsForWindow(
      occupancies,
      "10:30",
      20,
      3,
    );
    const occupiedNextHour = getOccupiedRoomsForWindow(
      occupancies,
      "11:00",
      50,
      3,
    );

    expect(occupied50.has("room-1")).toBe(true);
    expect(occupied30.has("room-1")).toBe(true);
    expect(occupied20Morning.has("room-1")).toBe(true);
    expect(occupied20Overlap.has("room-1")).toBe(true);
    expect(occupiedNextHour.has("room-1")).toBe(false);

    // 2 of 3 rooms still free
    expect(occupied50.size).toBe(1);
    expect(3 - occupied50.size).toBe(2);
  });

  it("marks all rooms sold out when 3 overlapping bookings fill capacity", () => {
    const occupancies: RoomOccupancy[] = [
      { time: "14:00", durationMinutes: 50, changeRoomId: "room-1" },
      { time: "14:00", durationMinutes: 30, changeRoomId: "room-2" },
      { time: "14:00", durationMinutes: 20, changeRoomId: "room-3" },
    ];

    const occupied = getOccupiedRoomsForWindow(occupancies, "14:00", 50, 3);
    expect(occupied.size).toBe(3);
    expect(3 - occupied.size).toBe(0);
  });
});
