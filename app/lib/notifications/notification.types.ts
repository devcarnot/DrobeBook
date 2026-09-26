export type NotificationDeliveryMethod = "post" | "pickup" | "local";

export type NotificationCategory =
  | "rental_created"
  | "rental_start"
  | "return_reminder"
  | "after_rental"
  | "rental_dispatched"
  | "rental_cancelled"
  | "waitlist_available"
  | "try_on_confirmed";

export type NotificationTrigger =
  | "on_create"
  | "on_status_change"
  | "days_before_start"
  | "on_start_date"
  | "days_before_end"
  | "on_end_date"
  | "days_after_end"
  | "on_waitlist_notify"
  | "on_appointment_confirm"
  | "manual";

export type NotificationTemplate = {
  id: string;
  name: string;
  category: NotificationCategory;
  deliveryMethods: NotificationDeliveryMethod[];
  channel: "email";
  subject: string;
  body: string;
  automated: boolean;
  trigger: NotificationTrigger;
  /** Negative = before anchor date, positive = after, 0 = on anchor day */
  offsetDays: number;
  /** Required workflow status when trigger is on_status_change */
  workflowStatus?: string;
  active: boolean;
};

export type NotificationsConfig = {
  enabled: boolean;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  templates: NotificationTemplate[];
};

export type RentalNotificationContext = {
  bookingId: string;
  customerName: string | null;
  customerEmail: string | null;
  productTitle: string | null;
  size: string;
  rentalStart: string;
  rentalEnd: string;
  eventDate: string;
  rentalStatus: string;
  deliveryMethod: string;
  shopifyOrderNumber: string | null;
  rentalCreatedAt: string;
  fulfillmentTrackingLink: string | null;
  returnTrackingLink: string | null;
};

export type WaitlistNotificationContext = {
  email: string;
  name: string | null;
  productTitle: string | null;
  claimUrl?: string | null;
};

export type AppointmentNotificationContext = {
  appointmentId: string;
  customerName: string | null;
  customerEmail: string | null;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  itemsToTryOn: string | null;
};

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  rental_created: "Rental created / confirmation",
  rental_start: "Rental start information",
  return_reminder: "Return reminder",
  after_rental: "After-rental message",
  rental_dispatched: "Dispatched / tracking",
  rental_cancelled: "Cancellation",
  waitlist_available: "Waitlist availability",
  try_on_confirmed: "Try-on appointment confirmed",
};

export const NOTIFICATION_TRIGGER_LABELS: Record<NotificationTrigger, string> = {
  on_create: "When rental is created",
  on_status_change: "When rental status changes",
  days_before_start: "Days before rental start",
  on_start_date: "On rental start date",
  days_before_end: "Days before rental end",
  on_end_date: "On rental end date",
  days_after_end: "Days after rental end",
  on_waitlist_notify: "When waitlist customer is notified",
  on_appointment_confirm: "When try-on appointment is confirmed",
  manual: "Manual send only",
};

export const NOTIFICATION_TOKENS = [
  { token: "{{customerFirstName}}", description: "Customer first name" },
  { token: "{{customerLastName}}", description: "Customer last name" },
  { token: "{{customerName}}", description: "Full customer name" },
  { token: "{{customerEmail}}", description: "Customer email" },
  { token: "{{rentalStartDate}}", description: "Rental start date" },
  { token: "{{rentalEndDate}}", description: "Rental end date" },
  { token: "{{eventDate}}", description: "Customer event date" },
  { token: "{{products}}", description: "Product and size for the rental" },
  { token: "{{rentalStatus}}", description: "Rental workflow status" },
  { token: "{{shopifyOrderNumber}}", description: "Linked Shopify order number" },
  { token: "{{rentalCreatedAt}}", description: "When the rental was created" },
  { token: "{{trackingLink}}", description: "Fulfillment tracking link" },
  { token: "{{returnTrackingLink}}", description: "Return tracking link" },
  { token: "{{shopName}}", description: "Your store name" },
  { token: "{{claimUrl}}", description: "Waitlist claim link (waitlist only)" },
  { token: "{{appointmentDate}}", description: "Try-on appointment date" },
  { token: "{{appointmentTime}}", description: "Try-on appointment time" },
  { token: "{{appointmentDuration}}", description: "Try-on duration in minutes" },
] as const;
