import type {
  AppointmentNotificationContext,
  RentalNotificationContext,
  WaitlistNotificationContext,
} from "./notification.types";
import {
  bodyTextToStructuredHtml,
  wrapNotificationEmailHtml,
} from "./notification-email-layout";

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

function deriveCustomerFirstName(
  name: string | null | undefined,
  email: string | null | undefined,
) {
  const trimmed = name?.trim();
  if (trimmed && !trimmed.includes("@")) {
    return splitCustomerName(trimmed).firstName;
  }

  const local = email?.split("@")[0]?.trim();
  if (local) {
    const words = local.split(/[._-]+/).filter(Boolean);
    if (words.length) {
      return words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return "there";
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
  const firstName = deriveCustomerFirstName(
    context.customerName,
    context.customerEmail,
  );
  const { lastName } = splitCustomerName(context.customerName);
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

export function buildAppointmentTokenMap(
  context: AppointmentNotificationContext,
  shopName: string,
) {
  const firstName = deriveCustomerFirstName(
    context.customerName,
    context.customerEmail,
  );
  const { lastName } = splitCustomerName(context.customerName);
  const products = context.itemsToTryOn?.trim() || "Try-on appointment";

  return {
    customerFirstName: firstName,
    customerLastName: lastName,
    customerName: context.customerName?.trim() || firstName,
    customerEmail: context.customerEmail ?? "",
    rentalStartDate: "",
    rentalEndDate: "",
    eventDate: "",
    products,
    rentalStatus: "",
    shopifyOrderNumber: "",
    rentalCreatedAt: "",
    trackingLink: "",
    returnTrackingLink: "",
    shopName,
    claimUrl: "",
    appointmentDate: formatDisplayDate(context.appointmentDate),
    appointmentTime: context.appointmentTime,
    appointmentDuration: String(context.durationMinutes),
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
  const shopName = tokens.shopName?.trim() || "GK Drobe";
  const bodyInnerHtml = bodyTextToStructuredHtml(bodyText);
  const bodyHtml = wrapNotificationEmailHtml({
    shopName,
    subject,
    bodyInnerHtml,
    preheader: bodyText.split("\n").find((line) => line.trim()) ?? subject,
  });

  return { subject, bodyText, bodyHtml };
}

/** Branded HTML wrapper for non-template emails (e.g. try-on credit). */
export function renderBrandedEmailFromText(input: {
  shopName: string;
  subject: string;
  bodyText: string;
}) {
  const bodyInnerHtml = bodyTextToStructuredHtml(input.bodyText.trim());
  return {
    bodyText: input.bodyText.trim(),
    bodyHtml: wrapNotificationEmailHtml({
      shopName: input.shopName,
      subject: input.subject,
      bodyInnerHtml,
      preheader: input.bodyText.split("\n").find((line) => line.trim()) ?? input.subject,
    }),
  };
}
