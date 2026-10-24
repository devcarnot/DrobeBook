import type { NotificationTemplate, NotificationsConfig } from "./notification.types";

function template(partial: NotificationTemplate): NotificationTemplate {
  return partial;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  template({
    id: "rental-created",
    name: "Rental confirmation",
    category: "rental_created",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Your rental is confirmed",
    body: `Hello {{customerFirstName}},

Your rental is confirmed — we can't wait for you to wear your gown.

{{products}}

Delivery date: {{rentalStartDate}}
Return date: {{rentalEndDate}}
Event date: {{eventDate}}

Order reference: {{shopifyOrderNumber}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_create",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "rental-dispatched",
    name: "Dispatched with tracking",
    category: "rental_dispatched",
    deliveryMethods: ["post", "local"],
    channel: "email",
    subject: "Your rental is on its way",
    body: `Hi {{customerFirstName}},

Your rental is on its way.

{{products}}

Track your delivery: {{trackingLink}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_status_change",
    workflowStatus: "dispatched",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "rental-cancelled",
    name: "Rental cancelled",
    category: "rental_cancelled",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Your rental has been cancelled",
    body: `Hello {{customerFirstName}},

Your rental for {{products}} has been cancelled.

If you have questions, reply to this email.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_status_change",
    workflowStatus: "cancelled",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "try-on-confirmed",
    name: "Try-on appointment confirmed",
    category: "try_on_confirmed",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Your try-on appointment with {{shopName}}",
    body: `Hello {{customerFirstName}},

Your try-on appointment is confirmed.

Date: {{appointmentDate}}
Time: {{appointmentTime}}
Duration: {{appointmentDuration}} minutes
{{products}}

We look forward to seeing you.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_appointment_confirm",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "waitlist-available",
    name: "Waitlist availability",
    category: "waitlist_available",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Good news — your gown may be available",
    body: `Hello {{customerFirstName}},

We now have availability that may work for your dates for {{products}}.

Book now while it's available: {{claimUrl}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_waitlist_notify",
    offsetDays: 0,
    active: true,
  }),
];

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = {
  enabled: true,
  fromName: "GK.Drobe",
  fromEmail: "",
  replyToEmail: "",
  templates: DEFAULT_NOTIFICATION_TEMPLATES.map((entry) => ({ ...entry })),
};
