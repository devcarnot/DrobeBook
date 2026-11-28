import { useState } from "react";

import type {

  ActionFunctionArgs,

  HeadersFunction,

  LoaderFunctionArgs,

} from "react-router";

import {

  Form,

  useActionData,

  useLoaderData,

  useNavigation,

  useOutlet,

} from "react-router";



import { ResponsiveGrid } from "../components/ResponsiveGrid";

import {

  NOTIFICATION_CATEGORY_LABELS,

  NOTIFICATION_TRIGGER_LABELS,

} from "../lib/notifications/notification.types";

import {

  getNotificationsConfig,

  notificationsConfigFromFormData,

  processScheduledAppointmentNotifications,

  processScheduledRentalNotifications,

  saveNotificationsConfig,

} from "../lib/notifications/notification.server";

import { authenticate } from "../shopify.server";

import { boundary } from "@shopify/shopify-app-react-router/server";
import notificationsStyles from "../styles/notifications.css?url";
import type { NotificationTemplate } from "../lib/notifications/notification.types";

function readFieldValue(event: {
  currentTarget: { value?: string } | null;
  target?: EventTarget | null;
}) {
  return (
    event.currentTarget?.value ??
    (event.target as HTMLInputElement | null)?.value ??
    ""
  );
}

export const links = () => [{ rel: "stylesheet", href: notificationsStyles }];

const SCHEDULED_RENTAL_TRIGGERS = new Set([
  "days_before_start",
  "on_start_date",
  "days_before_end",
  "on_end_date",
  "days_after_end",
]);

const SCHEDULED_APPOINTMENT_TRIGGERS = new Set(["days_before_appointment"]);

function templateMode(template: NotificationTemplate): {
  key: "auto" | "scheduled" | "manual" | "admin";
  label: string;
} {
  if (!template.automated) {
    return { key: "manual", label: "Manual only" };
  }
  if (template.category === "waitlist_admin_new") {
    return { key: "admin", label: "Admin alert" };
  }
  if (
    SCHEDULED_RENTAL_TRIGGERS.has(template.trigger) ||
    SCHEDULED_APPOINTMENT_TRIGGERS.has(template.trigger)
  ) {
    return { key: "scheduled", label: "Scheduled" };
  }
  if (template.trigger === "manual") {
    return { key: "manual", label: "Manual only" };
  }
  return { key: "auto", label: "Automatic" };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { session } = await authenticate.admin(request);

  const notifications = await getNotificationsConfig(session.shop);

  await Promise.all([
    processScheduledRentalNotifications(session.shop).catch(() => undefined),
    processScheduledAppointmentNotifications(session.shop).catch(() => undefined),
  ]);

  return {

    notifications,

    hasResend: Boolean(process.env.RESEND_API_KEY?.trim()),

    defaultFromEmail: process.env.NOTIFICATION_FROM_EMAIL ?? "",

  };

};



export const action = async ({ request }: ActionFunctionArgs) => {

  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = String(formData.get("intent") ?? "save");



  if (intent === "run-scheduled") {

    const [rental, appointment] = await Promise.all([
      processScheduledRentalNotifications(session.shop),
      processScheduledAppointmentNotifications(session.shop),
    ]);

    return {
      saved: false,
      scheduled: {
        processed: rental.processed + appointment.processed,
        sent: rental.sent + appointment.sent,
      },
    };

  }



  const notifications = notificationsConfigFromFormData(formData);

  await saveNotificationsConfig(session.shop, notifications);

  return { saved: true, notifications };

};



function scheduleLabel(template: {

  automated: boolean;

  active: boolean;

  trigger: keyof typeof NOTIFICATION_TRIGGER_LABELS;

  offsetDays: number;

}) {

  if (!template.active) {
    return "Inactive";
  }

  if (!template.automated) {
    return "Send manually from admin";
  }



  const trigger = NOTIFICATION_TRIGGER_LABELS[template.trigger];

  if (template.offsetDays === 0) {

    return trigger;

  }



  return `${template.offsetDays > 0 ? "+" : ""}${template.offsetDays} days · ${trigger}`;

}



export default function NotificationSettingsPage() {

  const outlet = useOutlet();

  const { notifications, hasResend, defaultFromEmail } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();

  const navigation = useNavigation();

  const isSaving = navigation.state !== "idle";

  const [draft, setDraft] = useState(notifications);



  if (outlet) {

    return outlet;

  }



  const activeCount = draft.templates.filter((template) => template.active).length;



  return (

    <s-page heading="Email notifications" inlineSize="large">

      <div className="gk-notification-page">

        {actionData?.saved ? (

          <s-banner tone="success">Notification settings saved.</s-banner>

        ) : null}

        {actionData?.scheduled ? (

          <s-banner tone="info">

            Checked scheduled notifications — processed {actionData.scheduled.processed}, sent{" "}

            {actionData.scheduled.sent}.

          </s-banner>

        ) : null}

        <Form method="post" style={{ marginTop: "1rem" }}>

          <input type="hidden" name="intent" value="save" />

          <div className="gk-notification-top">
            <section className="gk-notification-panel gk-notification-panel--muted">
              <span className="gk-notification-intro">
                <span className="gk-notification-intro__icon" aria-hidden="true">
                  ✉
                </span>
                <span>
                  <h2 className="gk-notification-panel__title">Automated customer emails</h2>
                  <p className="gk-notification-panel__lede">
                    Rental, try-on, and waitlist messages. Tokens include{" "}
                    <code>{"{{customerFirstName}}"}</code> and{" "}
                    <code>{"{{rentalStartDate}}"}</code>.
                  </p>
                  <p className="gk-notification-intro__meta">
                    {activeCount} active template{activeCount === 1 ? "" : "s"}
                  </p>
                </span>
              </span>
              {!hasResend ? (
                <div className="gk-notification-resend">
                  <s-banner tone="warning">
                    Set <s-text type="strong">RESEND_API_KEY</s-text> and{" "}
                    <s-text type="strong">NOTIFICATION_FROM_EMAIL</s-text> on Railway to deliver
                    real emails.
                  </s-banner>
                </div>
              ) : null}
            </section>

            <section className="gk-notification-panel">
              <h2 className="gk-notification-panel__title">Sender details</h2>
              <p className="gk-notification-panel__lede">
                From / Reply-To for customer emails. <strong>Reply-To</strong> also receives new
                waitlist admin alerts.
              </p>

              <s-stack direction="block" gap="large">

                <label className="gk-toggle-row">

                  <input

                    type="checkbox"

                    name="enabled"

                    value="true"

                    aria-label="Enable automated notifications"

                    checked={draft.enabled}

                    onChange={(event) =>

                      setDraft((current) => ({ ...current, enabled: event.currentTarget.checked }))

                    }

                  />

                  <span className="gk-toggle-row__copy">

                    <span className="gk-toggle-row__title">Enable automated notifications</span>

                    <span className="gk-toggle-row__desc">

                      Turn off to pause all automated sends while keeping templates configured.

                    </span>

                  </span>

                </label>



                <ResponsiveGrid layout="2">

                  <s-text-field

                    label="From name"

                    name="fromName"

                    value={draft.fromName}

                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        fromName: readFieldValue(event),
                      }))
                    }

                  />

                  <s-text-field

                    label="From email"

                    name="fromEmail"

                    value={draft.fromEmail ?? ""}

                    placeholder={defaultFromEmail || "notifications@yourdomain.com"}

                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        fromEmail: readFieldValue(event),
                      }))
                    }

                  />

                </ResponsiveGrid>



                <s-text-field

                  label="Reply-to email"

                  name="replyToEmail"

                  value={draft.replyToEmail}

                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      replyToEmail: readFieldValue(event),
                    }))
                  }

                />

              </s-stack>

            </section>
          </div>

            <section className="gk-notification-panel gk-notification-templates">

              <div className="gk-notification-templates__head">

                <div>
                  <h2 className="gk-notification-panel__title">Notification templates</h2>
                  <p className="gk-notification-panel__lede" style={{ marginBottom: 0 }}>
                    Click a template to edit delivery methods, triggers, and copy.{" "}
                    <strong>Mode</strong> shows whether DrobeBook sends it automatically.
                  </p>
                </div>

                <s-link href="/app/settings/notifications/new">

                  <s-button variant="primary">Add notification</s-button>

                </s-link>

              </div>

              <s-table variant="auto">

                <s-table-header-row>

                  <s-table-header listSlot="primary">Name</s-table-header>

                  <s-table-header listSlot="labeled">Mode</s-table-header>

                  <s-table-header listSlot="labeled">Category</s-table-header>

                  <s-table-header listSlot="labeled">When it sends</s-table-header>

                  <s-table-header listSlot="secondary">Status</s-table-header>

                </s-table-header-row>

                <s-table-body>

                  {draft.templates.map((template) => {
                    const mode = templateMode(template);
                    return (
                    <s-table-row key={template.id}>

                      <s-table-cell>

                        <s-link href={`/app/settings/notifications/${template.id}`}>

                          {template.name}

                        </s-link>

                      </s-table-cell>

                      <s-table-cell>
                        <span
                          className={`gk-notification-mode gk-notification-mode--${mode.key}`}
                        >
                          {mode.label}
                        </span>
                      </s-table-cell>

                      <s-table-cell>

                        {NOTIFICATION_CATEGORY_LABELS[template.category]}

                      </s-table-cell>

                      <s-table-cell>{scheduleLabel(template)}</s-table-cell>

                      <s-table-cell>

                        <s-badge tone={template.active ? "success" : "neutral"}>

                          {template.active ? "Active" : "Inactive"}

                        </s-badge>

                      </s-table-cell>

                    </s-table-row>
                    );
                  })}

                </s-table-body>

              </s-table>

            </section>



            <input type="hidden" name="templatesJson" value={JSON.stringify(draft.templates)} />



            <s-stack direction="inline" gap="base">

              <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>

                Save notification settings

              </s-button>

            </s-stack>

        </Form>

        <Form method="post" className="gk-notification-scheduled-foot">

          <input type="hidden" name="intent" value="run-scheduled" />

          <section className="gk-notification-panel gk-notification-panel--muted">

              <h2 className="gk-notification-panel__title">Scheduled reminders</h2>

              <div className="gk-notification-templates__head" style={{ marginBottom: 0 }}>

                <p className="gk-notification-panel__lede" style={{ margin: 0, flex: 1 }}>

                  Date-based rental and try-on reminders run when you open this page or use the
                  button below. Set up a daily cron to catch these even if you do not open the app.

                </p>

                <s-button type="submit" variant="secondary">

                  Run scheduled notifications

                </s-button>

              </div>

          </section>

        </Form>

      </div>

    </s-page>

  );

}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};

