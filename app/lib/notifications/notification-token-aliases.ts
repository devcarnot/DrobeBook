/** Adds snake_case aliases for merchant alert templates. */
export function withNotificationTokenAliases(
  tokens: Record<string, string>,
): Record<string, string> {
  const out = { ...tokens };

  const alias = (snake: string, camel: string) => {
    const value = tokens[camel]?.trim();
    if (value) {
      out[snake] = value;
    }
  };

  alias("customer_name", "customerName");
  alias("customer_email", "customerEmail");
  alias("customer_phone", "customerPhone");
  alias("merchant_name", "merchantName");
  alias("product_name", "productName");
  alias("product_size", "productSize");
  alias("product_names", "productName");
  alias("delivery_date", "rentalStartDate");
  alias("return_date", "rentalEndDate");
  alias("hire_duration", "hireDuration");
  alias("booking_status", "rentalStatus");
  alias("order_number", "shopifyOrderNumber");
  alias("order_total", "orderTotal");
  alias("event_date", "eventDate");
  alias("requested_hire_date", "rentalStartDate");
  alias("submission_date", "submissionDate");
  alias("waitlist_status", "waitlistStatus");
  alias("appointment_date", "appointmentDate");
  alias("appointment_time", "appointmentTime");
  alias("booking_reference", "bookingReference");
  alias("booking_type", "bookingType");
  alias("booking_date", "bookingDate");
  alias("cancellation_date", "cancellationDate");
  alias("previous_hire_dates", "previousHireDates");
  alias("updated_hire_dates", "updatedHireDates");
  alias("hire_dates", "hireDates");
  alias("pickup_date", "rentalStartDate");
  alias("pickup_time", "pickupCollectionWindow");
  alias("variant_id", "variantId");
  alias("issue_description", "issueDescription");
  alias("detected_at", "detectedAt");
  alias("notification_status", "notificationStatus");
  alias("sent_at", "sentAt");

  return out;
}