import type { NotificationTemplate } from "./notification.types";

function adminTemplate(
  partial: NotificationTemplate,
): NotificationTemplate {
  return {
    recipient: "merchant",
    category: "admin_alert",
    channel: "email",
    deliveryMethods: ["post", "pickup", "local"],
    automated: true,
    offsetDays: 0,
    active: true,
    ...partial,
  };
}

export const ADMIN_ALERT_TEMPLATES: NotificationTemplate[] = [
  adminTemplate({
    id: "admin-hire-booking",
    name: "New Hire Booking — Admin Alert",
    subject: "New Hire Booking Received — {{customerName}}",
    trigger: "on_create",
    body: `Hi {{merchantName}},

A new hire booking has been received through your store.

Customer Details
Name: {{customerName}}
Email: {{customerEmail}}
Phone: {{customerPhone}}

Booking Details
Product: {{productName}}
Size: {{productSize}}
Delivery Date: {{rentalStartDate}}
Return Date: {{rentalEndDate}}
Hire Duration: {{hireDuration}}
Booking Status: {{rentalStatus}}

Order Details
Order Number: {{shopifyOrderNumber}}
Order Total: {{orderTotal}}

Review in DrobeBook: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-waitlist-enquiry",
    name: "New Waitlist Enquiry — Admin Alert",
    subject: "New Waitlist Enquiry — {{productName}}",
    trigger: "on_waitlist_created",
    body: `Hi {{merchantName}},

A customer has joined the waitlist for one of your garments.

Customer Details
Name: {{customerName}}
Email: {{customerEmail}}
Phone: {{customerPhone}}

Waitlist Details
Product: {{productName}}
Size: {{productSize}}
Requested Event Date: {{eventDate}}
Requested Hire Date: {{rentalStartDate}}
Submission Date: {{submissionDate}}
Waitlist Status: {{waitlistStatus}}

Review: {{waitlistAdminUrl}}`,
  }),
  adminTemplate({
    id: "admin-tryon-booking",
    name: "New Try-On Booking — Admin Alert",
    subject: "New Try-On Booking — {{customerName}}",
    trigger: "on_appointment_confirm",
    body: `Hi {{merchantName}},

A new try-on appointment has been booked.

Customer Details
Name: {{customerName}}
Email: {{customerEmail}}
Phone: {{customerPhone}}

Appointment Details
Product: {{products}}
Appointment Date: {{appointmentDate}}
Appointment Time: {{appointmentTime}}
Duration: {{appointmentDuration}} minutes
Booking Status: confirmed

Review: {{adminAppointmentUrl}}`,
  }),
  adminTemplate({
    id: "admin-booking-cancelled",
    name: "Booking Cancelled — Admin Alert",
    subject: "Booking Cancelled — {{bookingReference}}",
    trigger: "on_status_change",
    workflowStatus: "cancelled",
    body: `Hi {{merchantName}},

A booking has been cancelled.

Customer Details
Name: {{customerName}}
Email: {{customerEmail}}
Phone: {{customerPhone}}

Booking Details
Reference: {{bookingReference}}
Product: {{productName}}
Type: {{bookingType}}
Date: {{bookingDate}}
Cancellation Date: {{cancellationDate}}

Review: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-booking-updated",
    name: "Booking Updated — Admin Alert",
    subject: "Booking Updated — {{bookingReference}}",
    trigger: "on_booking_updated",
    body: `Hi {{merchantName}},

An existing booking has been updated.

Customer Details
Name: {{customerName}}
Email: {{customerEmail}}

Booking Details
Reference: {{bookingReference}}
Product: {{productName}}
Previous Hire Dates: {{previousHireDates}}
Updated Hire Dates: {{updatedHireDates}}
Size: {{productSize}}
Status: {{rentalStatus}}

Review: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-high-value-booking",
    name: "High-Value Booking — Admin Alert",
    subject: "High-Value Booking Received — {{orderTotal}}",
    trigger: "on_create",
    body: `Hi {{merchantName}},

A high-value booking has been received.

Customer: {{customerName}}
Order Number: {{shopifyOrderNumber}}
Product(s): {{productName}}
Hire Dates: {{hireDates}}
Order Total: {{orderTotal}}

This booking exceeded your configured threshold.

Review: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-backup-dress-issue",
    name: "Backup Dress Pricing Issue — Admin Alert",
    subject: "Backup Dress Pricing Issue — Action Required",
    trigger: "on_backup_dress_issue",
    active: true,
    body: `Hi {{merchantName}},

DrobeBook detected a backup dress pricing issue.

Product: {{productName}}
Variant: {{variantId}}
Issue: {{issueDescription}}
Detected At: {{detectedAt}}

Review backup dress settings: {{adminBackupUrl}}`,
  }),
  adminTemplate({
    id: "admin-return-due",
    name: "Upcoming Dress Return — Admin Alert",
    subject: "Upcoming Dress Return — {{customerName}}",
    trigger: "days_before_end",
    offsetDays: -1,
    body: `Hi {{merchantName}},

A hired garment is approaching its return date.

Customer: {{customerName}}
Product: {{productName}}
Size: {{productSize}}
Return Date: {{rentalEndDate}}
Reference: {{bookingReference}}

Review: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-studio-pickup",
    name: "Studio Pickup Booking — Admin Alert",
    subject: "New Studio Pickup Arrangement — {{customerName}}",
    trigger: "on_create",
    deliveryMethods: ["pickup", "local"],
    body: `Hi {{merchantName}},

A customer selected studio pickup for their hire.

Customer: {{customerName}}
Email: {{customerEmail}}
Phone: {{customerPhone}}

Pickup Details
Product: {{productName}}
Pickup / delivery date: {{rentalStartDate}}
Collection window: {{pickupCollectionWindow}}
Reference: {{bookingReference}}

Review: {{adminBookingUrl}}`,
  }),
  adminTemplate({
    id: "admin-waitlist-notify-sent",
    name: "Waitlist Availability Action — Admin Alert",
    subject: "Waitlist Availability Email Sent — {{customerName}}",
    trigger: "on_waitlist_notify",
    body: `Hi {{merchantName}},

An availability email was sent to a waitlisted customer.

Customer: {{customerName}}
Email: {{customerEmail}}
Product: {{productName}}
Requested Date: {{rentalStartDate}}
Sent At: {{sentAt}}
Status: {{notificationStatus}}

View waitlist: {{waitlistAdminUrl}}`,
  }),
];