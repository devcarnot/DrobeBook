const PROTECTED_CUSTOMER_DATA_PATTERN =
  /access denied for customers? field|protected customer data|not approved to access the customer/i;

export function isProtectedCustomerDataError(message: string) {
  return PROTECTED_CUSTOMER_DATA_PATTERN.test(message);
}

export function protectedCustomerDataHelpMessage() {
  return [
    "Shopify customer access is not enabled for this app yet.",
    "In Partner Dashboard → DrobeBook → API access requests, request Protected customer data and select the Name and Email fields.",
    "Then reopen the app from your dev store and accept the updated permissions.",
    "Add customers in Shopify Admin until access is approved.",
  ].join(" ");
}

export function formatShopifyAccessError(message: string) {
  if (isProtectedCustomerDataError(message)) {
    return protectedCustomerDataHelpMessage();
  }

  return message;
}
