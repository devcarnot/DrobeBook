import type {
  RentalNotificationContext,
  WaitlistNotificationContext,
} from "./notification.types";

function splitCustomerName(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts[0] ?? "there",
    lastName: parts.slice(1).join(" "),
  };
}

function formatDisplayDate(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCreatedAt(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>\n");
}

export function buildRentalTokenMap(
  context: RentalNotificationContext,
  shopName: string,
) {
  const { firstName, lastName } = splitCustomerName(context.customerName);
  const products = [context.productTitle, context.size ? `Size ${context.size}` : ""]
    .filter(Boolean)
    .join(" · ");

  return {
    customerFirstName: firstName,
    customerLastName: lastName,
    customerName: context.customerName?.trim() || firstName,
    customerEmail: context.customerEmail ?? "",
    rentalStartDate: formatDisplayDate(context.rentalStart),
    rentalEndDate: formatDisplayDate(context.rentalEnd),
    eventDate: formatDisplayDate(context.eventDate),
    products,
    rentalStatus: context.rentalStatus,
    shopifyOrderNumber: context.shopifyOrderNumber ?? "",
    rentalCreatedAt: formatCreatedAt(context.rentalCreatedAt),
    trackingLink: context.fulfillmentTrackingLink ?? "",
    returnTrackingLink: context.returnTrackingLink ?? "",
    shopName,
    claimUrl: "",
  };
}

export function buildWaitlistTokenMap(
  context: WaitlistNotificationContext,
  shopName: string,
) {
  const { firstName, lastName } = splitCustomerName(context.name);

  return {
    customerFirstName: firstName,
    customerLastName: lastName,
    customerName: context.name?.trim() || firstName,
    customerEmail: context.email,
    rentalStartDate: "",
    rentalEndDate: "",
    eventDate: "",
    products: context.productTitle ?? "your selected gown",
    rentalStatus: "",
    shopifyOrderNumber: "",
    rentalCreatedAt: "",
    trackingLink: "",
    returnTrackingLink: "",
    shopName,
    claimUrl: context.claimUrl ?? "",
  };
}

export function renderNotificationTemplate(
  template: string,
  tokens: Record<string, string>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => tokens[key] ?? "");
}

export function renderNotificationEmail(
  subjectTemplate: string,
  bodyTemplate: string,
  tokens: Record<string, string>,
) {
  const subject = renderNotificationTemplate(subjectTemplate, tokens).trim();
  const bodyText = renderNotificationTemplate(bodyTemplate, tokens).trim();
  const bodyHtml = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">${textToHtml(bodyText)}</div>`;

  return { subject, bodyText, bodyHtml };
}
