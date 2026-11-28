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
    id: "rental-upcoming-post",
    name: "Upcoming rental reminder (post)",
    category: "rental_start",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Your rental starts tomorrow",
    body: `Hi {{customerFirstName}},

A reminder that your rental starts tomorrow ({{rentalStartDate}}).

{{products}}

We're preparing your gown for postage. Track delivery when dispatched: {{trackingLink}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_start",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "rental-upcoming-pickup",
    name: "Upcoming rental reminder (pickup)",
    category: "rental_start",
    deliveryMethods: ["pickup", "local"],
    channel: "email",
    subject: "Your rental starts tomorrow",
    body: `Hi {{customerFirstName}},

Your rental starts tomorrow ({{rentalStartDate}}).

{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_start",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "pickup-collection-reminder",
    name: "Studio pickup — collection window (day before)",
    category: "rental_start",
    deliveryMethods: ["pickup", "local"],
    channel: "email",
    subject: "Studio pickup tomorrow — {{pickupCollectionWindow}}",
    body: `Hi {{customerFirstName}},

Your gown is ready for studio pickup tomorrow ({{rentalStartDate}}).

Collection window: {{pickupCollectionWindow}}

{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_start",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "rental-delivery-day-post",
    name: "Delivery / garment arrives today (post)",
    category: "rental_start",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Your rental arrives today",
    body: `Hi {{customerFirstName}},

Your rental is due to arrive today.

{{products}}

Tracking: {{trackingLink}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_start_date",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "rental-pickup-day",
    name: "Pick-up day reminder (studio)",
    category: "rental_start",
    deliveryMethods: ["pickup", "local"],
    channel: "email",
    subject: "Today is pick-up day",
    body: `Hi {{customerFirstName}},

Today is pick-up day for your rental ({{rentalStartDate}}).

{{products}}

Collection window: {{pickupCollectionWindow}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_start_date",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "rental-dispatched",
    name: "Garment posted / dispatched",
    category: "rental_dispatched",
    deliveryMethods: ["post", "local"],
    channel: "email",
    subject: "Your rental is on its way",
    body: `Hi {{customerFirstName}},

Your rental has been posted and is on its way.

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
    id: "return-reminder-post-day-before",
    name: "Return reminder — day before (post)",
    category: "return_reminder",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Return your rental tomorrow",
    body: `Hi {{customerFirstName}},

Your rental ends tomorrow ({{rentalEndDate}}). Please post your gown back in time for our next customer.

{{products}}

Return label / tracking: {{returnTrackingLink}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_end",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "return-reminder-post-same-day",
    name: "Post-back reminder (return due today)",
    category: "return_reminder",
    deliveryMethods: ["post"],
    channel: "email",
    subject: "Please post your rental back today",
    body: `Hi {{customerFirstName}},

Today is the last day of your hire ({{rentalEndDate}}). Please post your gown back today.

{{products}}

Return label / tracking: {{returnTrackingLink}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_end_date",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "return-reminder-pickup-day-before",
    name: "Drop-back reminder — day before (pickup)",
    category: "return_reminder",
    deliveryMethods: ["pickup", "local"],
    channel: "email",
    subject: "Return your rental tomorrow",
    body: `Hi {{customerFirstName}},

Your rental ends tomorrow ({{rentalEndDate}}). Please drop your gown back to the studio.

{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_end",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "return-reminder-pickup-same-day",
    name: "Drop-back reminder (due today)",
    category: "return_reminder",
    deliveryMethods: ["pickup", "local"],
    channel: "email",
    subject: "Please return your rental today",
    body: `Hi {{customerFirstName}},

Today is the last day of your hire ({{rentalEndDate}}). Please drop your gown back to the studio today.

{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_end_date",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "after-rental-thank-you",
    name: "After-rental thank you",
    category: "after_rental",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Thank you from {{shopName}}",
    body: `Hello {{customerFirstName}},

Thank you for hiring with us. We hope you had a wonderful time in your gown.

If you'd like to hire again, we'd love to see you.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_after_end",
    offsetDays: 1,
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

Gowns to try: {{products}}

We look forward to seeing you.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_appointment_confirm",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "try-on-reminder",
    name: "Try-on appointment reminder",
    category: "try_on_reminder",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Reminder — try-on appointment tomorrow",
    body: `Hi {{customerFirstName}},

This is a reminder about your try-on appointment tomorrow.

Date: {{appointmentDate}}
Time: {{appointmentTime}}

{{products}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "days_before_appointment",
    offsetDays: -1,
    active: true,
  }),
  template({
    id: "try-on-item-unavailable",
    name: "Requested try-on item unavailable",
    category: "try_on_unavailable",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Update on your try-on request",
    body: `Hello {{customerFirstName}},

Unfortunately a gown you asked to try on is not available for your appointment:

{{products}}

Please reply or call us if you'd like to choose another gown.

Kind regards,
{{shopName}}`,
    automated: false,
    trigger: "on_appointment_item_unavailable",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "waitlist-admin-new",
    name: "New waitlist enquiry (admin)",
    category: "waitlist_admin_new",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "New waitlist enquiry — {{customerName}}",
    body: `Hello {{shopName}} team,

A customer just joined the waitlist.

Customer: {{customerName}} ({{customerEmail}})
Phone: {{customerPhone}}

{{products}}
{{waitlistDetails}}

Review in DrobeBook: {{waitlistAdminUrl}}

— DrobeBook`,
    automated: true,
    trigger: "on_waitlist_created",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "waitlist-available",
    name: "Waitlist availability",
    category: "waitlist_available",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Good news — availability may be open",
    body: `Hello {{customerFirstName}},

{{waitlistDetails}}

Book now while it's available: {{claimUrl}}

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_waitlist_notify",
    offsetDays: 0,
    active: true,
  }),
  template({
    id: "waitlist-removed",
    name: "Removed from waitlist",
    category: "waitlist_removed",
    deliveryMethods: ["post", "pickup", "local"],
    channel: "email",
    subject: "Update on your waitlist request",
    body: `Hello {{customerFirstName}},

You have been removed from our waitlist for {{products}}.

{{waitlistDetails}}

If this was a mistake or you would still like to book, reply to this email or visit {{shopName}} online.

Kind regards,
{{shopName}}`,
    automated: true,
    trigger: "on_waitlist_removed",
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
