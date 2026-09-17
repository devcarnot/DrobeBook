export function getChangeRoomIds(changeRoomCount: number): string[] {
  const count = Math.max(1, Math.min(changeRoomCount, 6));
  return Array.from({ length: count }, (_, index) => `room-${index + 1}`);
}

export function capacityPerChangeRoom(): number {
  return 1;
}
