import type { NotificationTemplate, NotificationsConfig } from "./notification.types";

function template(partial: NotificationTemplate): NotificationTemplate {
  return partial;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  template({
    id: "rental-start-post",
    name: "Rental Start Information [example]",
    category: "rental_start",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Information about your upcoming rental",
    body: `Hello {{customerFirstName}},

Just a quick reminder that your rental starts on {{rentalStartDate}}.

You'll receive a separate email with tracking if we haven't sent it already.

The item you're renting:
{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_start",
    offsetDays: -3,
    active: false,
  }),
  template({
    id: "return-reminder-post",
    name: "Return Reminder [example]",
    category: "return_reminder",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Your return is due today",
    body: `Hi {{customerFirstName}},

Hope you enjoyed your rental. The following item is due for return today:

{{products}}

Please use the prepaid return satchel provided with your delivery.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_end_date",
    offsetDays: 0,
    active: false,
  }),
  template({
    id: "after-rental-all",
    name: "After-Rental Message [example]",
    category: "after_rental",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Thanks for renting with us",
    body: `Hey {{customerFirstName}},

Thanks for renting with {{shopName}}. We'd love to hear how your experience was.

If you have photos from your event, tag us on Instagram — we'd love to see you in your gown.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_after_end",
    offsetDays: 1,
    active: false,
  }),
  template({
    id: "rental-created",
    name: "Rental confirmation",
    category: "rental_created",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Your rental is confirmed",
    body: `Hello {{customerFirstName}},

Your rental is confirmed for {{products}}.

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

Your rental has been dispatched.

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
