import { addDays, toDateOnly } from "../booking/availability";

export function deliveryDateFromWaitlistEvent(
  eventDate: Date | null | undefined,
): Date | null {
  if (!eventDate) {
    return null;
  }
  return addDays(toDateOnly(eventDate), -1);
}

export function parseWaitlistEntryNotes(notes: string | null | undefined): {
  customerMessage: string | null;
  deliveryFromNotes: string | null;
} {
  if (!notes?.trim()) {
    return { customerMessage: null, deliveryFromNotes: null };
  }

  const lines = notes
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let deliveryFromNotes: string | null = null;
  const customerLines: string[] = [];

  for (const line of lines) {
    if (/^Delivery start:/i.test(line)) {
      deliveryFromNotes = line.replace(/^Delivery start:\s*/i, "").trim();
    } else {
      customerLines.push(line);
    }
  }

  return {
    customerMessage: customerLines.length ? customerLines.join("\n") : null,
    deliveryFromNotes,
  };
}