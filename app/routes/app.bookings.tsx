import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const bookings = await prisma.booking.findMany({
    where: { shop: session.shop },
    orderBy: { startDate: "desc" },
    take: 50,
  });

  return {
    bookings: bookings.map((booking) => ({
      id: booking.id,
      productId: booking.productId,
      size: booking.size,
      startDate: booking.startDate.toISOString().slice(0, 10),
      endDate: booking.endDate.toISOString().slice(0, 10),
      eventDate: booking.eventDate.toISOString().slice(0, 10),
      deliveryMethod: booking.deliveryMethod,
      status: booking.status,
      orderId: booking.orderId,
    })),
  };
};

function formatDisplayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusTone(status: string): "success" | "warning" | "critical" | "info" {
  if (status === "confirmed") return "success";
  if (status === "cancelled") return "critical";
  return "warning";
}

export default function BookingsPage() {
  const { bookings } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Bookings">
      <s-section heading="Recent hire bookings">
        <s-paragraph tone="neutral" color="subdued">
          Bookings created through the storefront widget. Showing the latest 50
          records.
        </s-paragraph>

        {bookings.length === 0 ? (
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text type="strong">No bookings yet</s-text>
              <s-paragraph tone="neutral" color="subdued">
                When customers complete a hire through the booking widget,
                bookings will appear here.
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Delivery</s-table-header>
              <s-table-header listSlot="labeled">Size</s-table-header>
              <s-table-header listSlot="labeled">Return</s-table-header>
              <s-table-header listSlot="labeled">Event</s-table-header>
              <s-table-header listSlot="labeled">Method</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {bookings.map((booking) => (
                <s-table-row key={booking.id}>
                  <s-table-cell>
                    {formatDisplayDate(booking.startDate)}
                  </s-table-cell>
                  <s-table-cell>{booking.size}</s-table-cell>
                  <s-table-cell>{formatDisplayDate(booking.endDate)}</s-table-cell>
                  <s-table-cell>{formatDisplayDate(booking.eventDate)}</s-table-cell>
                  <s-table-cell>{booking.deliveryMethod}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(booking.status)}>
                      {booking.status}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Order links">
        <s-paragraph>
          When a booking is linked to a Shopify order, the order ID is stored.
          Full order management stays in Shopify Admin → Orders.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
