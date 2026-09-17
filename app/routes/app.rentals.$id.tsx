import type {

  ActionFunctionArgs,

  HeadersFunction,

  LoaderFunctionArgs,

} from "react-router";

import type { ReactNode } from "react";

import {

  Form,

  useActionData,

  useLoaderData,

  useNavigation,

} from "react-router";



import { ResponsiveGrid } from "../components/ResponsiveGrid";

import { getRentalById } from "../lib/rental/rental.server";

import { shopifyRentalOrderAdminUrl } from "../lib/rental/rental-shopify.server";

import { isUsableResendKey } from "../lib/notifications/notification-email.server";

import {

  bookingToNotificationContext,

  getNotificationsConfig,

  listRecentNotificationSends,

  sendRentalNotification,

} from "../lib/notifications/notification.server";

import {

  RENTAL_STATUS_LABELS,

  RENTAL_STATUS_TONES,

  type ShopifyOrderMode,

} from "../lib/rental/rental.types";

import { authenticate } from "../shopify.server";

import { boundary } from "@shopify/shopify-app-react-router/server";



function formatDisplayDate(iso: string) {

  const date = new Date(`${iso}T12:00:00.000Z`);

  return date.toLocaleDateString("en-AU", {

    day: "numeric",

    month: "short",

    year: "numeric",

    timeZone: "UTC",

  });

}



function formatSentAt(date: Date) {

  return date.toLocaleString("en-AU", {

    day: "numeric",

    month: "short",

    year: "numeric",

    hour: "numeric",

    minute: "2-digit",

  });

}



function deliveryLabel(method: string) {

  if (method === "pickup") {

    return "Local pickup";

  }

  if (method === "local") {

    return "Local delivery";

  }

  return "Post (shipping)";

}



function DetailRow({

  label,

  children,

  empty,

}: {

  label: string;

  children: ReactNode;

  empty?: boolean;

}) {

  return (

    <div className="gk-detail-row">

      <span className="gk-detail-row__label">{label}</span>

      <span className={`gk-detail-row__value${empty ? " gk-detail-row__value--empty" : ""}`}>

        {children}

      </span>

    </div>

  );

}



function DetailSection({

  title,

  description,

  children,

}: {

  title: string;

  description?: string;

  children: ReactNode;

}) {

  return (

    <s-box padding="large" background="base" border="base" borderRadius="large">

      <h3 className="gk-detail-section-title">{title}</h3>

      {description ? <p className="gk-detail-section-desc">{description}</p> : null}

      {children}

    </s-box>

  );

}



export const loader = async ({ request, params }: LoaderFunctionArgs) => {

  const { session } = await authenticate.admin(request);

  const rentalId = params.id;



  if (!rentalId) {

    throw new Response("Missing rental id", { status: 400 });

  }



  const rental = await getRentalById(session.shop, rentalId);



  if (!rental) {

    throw new Response("Rental not found", { status: 404 });

  }



  const [notifications, recentSends] = await Promise.all([

    getNotificationsConfig(session.shop),

    listRecentNotificationSends(session.shop, rentalId),

  ]);



  const sendableTemplates = notifications.templates.filter(

    (template) => template.active && template.channel === "email",

  );



  const shopifyOrderMode = rental.shopifyOrderMode as ShopifyOrderMode;

  const shopifyOrderUrl =

    rental.orderId && shopifyOrderMode !== "none"

      ? shopifyRentalOrderAdminUrl(session.shop, rental.orderId, shopifyOrderMode)

      : null;



  return {

    rental,

    sendableTemplates,

    recentSends,

    notificationsEnabled: notifications.enabled,

    shopifyOrderUrl,

    shopifyOrderMode,

    emailDeliveryConfigured:

      isUsableResendKey(process.env.RESEND_API_KEY) &&

      Boolean(process.env.NOTIFICATION_FROM_EMAIL?.trim()),

  };

};



export const action = async ({ request, params }: ActionFunctionArgs) => {

  const { session } = await authenticate.admin(request);

  const rentalId = params.id;



  if (!rentalId) {

    throw new Response("Missing rental id", { status: 400 });

  }



  const formData = await request.formData();

  const intent = String(formData.get("intent") ?? "");



  if (intent !== "send-notification") {

    return { ok: false, error: "Unknown action" };

  }



  const templateId = String(formData.get("templateId") ?? "").trim();

  if (!templateId) {

    return { ok: false, error: "Choose a notification template." };

  }



  const booking = await getRentalById(session.shop, rentalId);

  if (!booking) {

    throw new Response("Rental not found", { status: 404 });

  }



  if (!booking.customerEmail?.trim()) {

    return { ok: false, error: "This rental has no customer email." };

  }



  const context = bookingToNotificationContext({

    id: booking.id,

    customerName: booking.customerName,

    customerEmail: booking.customerEmail,

    productTitle: booking.productTitle,

    size: booking.size,

    startDate: new Date(`${booking.rentalStart}T12:00:00.000Z`),

    endDate: new Date(`${booking.rentalEnd}T12:00:00.000Z`),

    eventDate: new Date(`${booking.eventDate}T12:00:00.000Z`),

    workflowStatus: booking.workflowStatus,

    deliveryMethod: booking.deliveryMethod,

    orderId: booking.orderId,

    createdAt: new Date(booking.createdAt),

    fulfillmentTrackingLink: booking.fulfillmentTrackingLink,

    returnTrackingLink: booking.returnTrackingLink,

  });



  const result = await sendRentalNotification(session.shop, context, {

    trigger: "manual",

    templateId,

    anchorDate: `manual-${Date.now()}`,

  });



  if (result.sent === 0) {

    return {

      ok: false,

      error:

        result.error ??

        "Email was not sent. Check notification settings and template status.",

    };

  }



  return {

    ok: true,

    sent: result.sent,

    warning: result.warning,

    loggedOnly: Boolean(result.warning),

  };

};



export default function RentalDetailPage() {

  const {

    rental,

    sendableTemplates,

    recentSends,

    notificationsEnabled,

    shopifyOrderUrl,

    shopifyOrderMode,

    emailDeliveryConfigured,

  } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();

  const navigation = useNavigation();

  const isSending = navigation.state !== "idle";

  const tone = RENTAL_STATUS_TONES[rental.workflowStatus];

  const pageTitle = rental.productTitle ?? "Rental details";



  return (

    <s-page heading={pageTitle} inlineSize="large">

      <s-link slot="breadcrumb-actions" href="/app/rentals">

        Rentals

      </s-link>



      <s-stack direction="block" gap="large">

        {actionData?.ok ? (

          <s-banner tone="success">

            {actionData.loggedOnly

              ? "Notification prepared and logged on the server (dev mode)."

              : "Notification email sent to the customer."}

          </s-banner>

        ) : null}

        {actionData?.warning ? (

          <s-banner tone="info">{actionData.warning}</s-banner>

        ) : null}

        {actionData?.error ? <s-banner tone="critical">{actionData.error}</s-banner> : null}



        <s-box padding="large" background="subdued" borderRadius="large">

          <div className="gk-detail-hero">

            <div className="gk-detail-hero__main">

              <span className="gk-detail-hero__title">{pageTitle}</span>

              <span className="gk-detail-hero__subtitle">

                {rental.customerName ?? "No customer"} · Size {rental.size} ·{" "}

                {deliveryLabel(rental.deliveryMethod)}

              </span>

            </div>

            <s-badge tone={tone}>{RENTAL_STATUS_LABELS[rental.workflowStatus]}</s-badge>

          </div>



          <div className="gk-detail-actions" style={{ marginTop: "1rem" }}>

            <s-link href={`/app/bookings/detail?bookingId=${rental.id}`}>

              <s-button variant="primary">Edit dates & buffers</s-button>

            </s-link>

            <s-link href="/app/bookings">

              <s-button>Open rental calendar</s-button>

            </s-link>

            <s-link href="/app/rentals">

              <s-button>Back to all rentals</s-button>

            </s-link>

          </div>

        </s-box>



        <div className="gk-detail-timeline">

          <div className="gk-detail-timeline__item">

            <span className="gk-detail-timeline__label">Rental start</span>

            <span className="gk-detail-timeline__value">

              {formatDisplayDate(rental.rentalStart)}

            </span>

          </div>

          <div className="gk-detail-timeline__item">

            <span className="gk-detail-timeline__label">Event date</span>

            <span className="gk-detail-timeline__value">

              {formatDisplayDate(rental.eventDate)}

            </span>

          </div>

          <div className="gk-detail-timeline__item">

            <span className="gk-detail-timeline__label">Return due</span>

            <span className="gk-detail-timeline__value">

              {formatDisplayDate(rental.rentalEnd)}

            </span>

          </div>

        </div>



        <ResponsiveGrid layout="2">

          <DetailSection

            title="Customer & order"

            description="Who booked this rental and how it was created in Shopify."

          >

            <div className="gk-detail-rows">

              <DetailRow label="Customer">{rental.customerName ?? "Not set"}</DetailRow>

              <DetailRow label="Email" empty={!rental.customerEmail}>

                {rental.customerEmail ?? "No email on file"}

              </DetailRow>

              <DetailRow label="Delivery">{deliveryLabel(rental.deliveryMethod)}</DetailRow>

              <DetailRow label="Shopify order" empty={!shopifyOrderUrl}>

                {shopifyOrderUrl ? (

                  <s-link href={shopifyOrderUrl} target="_blank">

                    {shopifyOrderMode === "draft"

                      ? `Open draft #${rental.orderId}`

                      : `Open order #${rental.orderId}`}

                  </s-link>

                ) : (

                  "No linked order"

                )}

              </DetailRow>

              <DetailRow label="Price paid" empty={!rental.pricePaid}>

                {rental.pricePaid ?? "Not recorded"}

              </DetailRow>

              {rental.tags.length ? (

                <DetailRow label="Tags">{rental.tags.join(", ")}</DetailRow>

              ) : null}

            </div>

          </DetailSection>



          <DetailSection

            title="Tracking & notes"

            description="Internal notes and shipment tracking for fulfillment and returns."

          >

            <div className="gk-detail-rows">

              <DetailRow label="Notes" empty={!rental.rentalNotes}>

                {rental.rentalNotes ?? "No notes added"}

              </DetailRow>

              <DetailRow

                label="Outward tracking"

                empty={!rental.fulfillmentTrackingNumber && !rental.fulfillmentTrackingLink}

              >

                {rental.fulfillmentTrackingNumber ?? rental.fulfillmentTrackingLink ?? "Not added"}

              </DetailRow>

              <DetailRow

                label="Return tracking"

                empty={!rental.returnTrackingNumber && !rental.returnTrackingLink}

              >

                {rental.returnTrackingNumber ?? rental.returnTrackingLink ?? "Not added"}

              </DetailRow>

              <DetailRow label="Created">

                {formatDisplayDate(rental.createdAt.slice(0, 10))}

              </DetailRow>

            </div>

          </DetailSection>

        </ResponsiveGrid>



        <DetailSection

          title="Email customer"

          description="Send a manual notification using your saved email templates."

        >

          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">

            <span />

            <s-link href="/app/settings/notifications">Manage templates →</s-link>

          </s-stack>



          {!emailDeliveryConfigured ? (

            <s-banner tone="info">

              Emails are logged in the server console until you add a real{" "}

              <s-text type="strong">RESEND_API_KEY</s-text> and verified{" "}

              <s-text type="strong">NOTIFICATION_FROM_EMAIL</s-text> in your app `.env` file.

            </s-banner>

          ) : null}



          {!notificationsEnabled ? (

            <s-banner tone="warning">

              Automated notifications are disabled. Manual sends still work with active templates.

            </s-banner>

          ) : null}



          {!rental.customerEmail ? (

            <s-text tone="neutral" color="subdued">

              This rental has no customer email, so notifications cannot be sent.

            </s-text>

          ) : sendableTemplates.length === 0 ? (

            <s-text tone="neutral" color="subdued">

              No active email templates. Add or activate templates under Notifications.

            </s-text>

          ) : (

            <Form method="post">

              <input type="hidden" name="intent" value="send-notification" />

              <div className="gk-detail-email-form">

                <div className="gk-form-field">

                  <label className="gk-form-field__label" htmlFor="rental-email-template">

                    Email template

                  </label>

                  <select

                    id="rental-email-template"

                    className="gk-select"

                    name="templateId"

                    defaultValue={sendableTemplates[0]?.id ?? ""}

                  >

                    {sendableTemplates.map((template) => (

                      <option key={template.id} value={template.id}>

                        {template.name}

                      </option>

                    ))}

                  </select>

                </div>

                <s-button

                  type="submit"

                  variant="primary"

                  {...(isSending ? { loading: true } : {})}

                >

                  Send email

                </s-button>

              </div>

            </Form>

          )}



          {recentSends.length ? (

            <div className="gk-detail-email-history">

              <span className="gk-detail-section-title">Recent emails</span>

              {recentSends.map((send) => (

                <div key={send.id} className="gk-detail-email-history__item">

                  <span className="gk-detail-email-history__subject">{send.subject}</span>

                  <span>{formatSentAt(send.createdAt)}</span>

                  <span>{send.status}</span>

                </div>

              ))}

            </div>

          ) : null}

        </DetailSection>

      </s-stack>

    </s-page>

  );

}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};

