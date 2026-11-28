import { useEffect, useMemo, useState } from "react";

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



import {
  buildListPagination,
  ListPaginationBar,
} from "../components/ListPaginationBar";
import { InfoHoverTooltip } from "../components/InfoHoverTooltip";
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
import { isMerchantTemplate } from "../lib/notifications/notification-template-mode";
import { readCheckValue, readFieldValue } from "../lib/read-field-value";

export const links = () => [{ rel: "stylesheet", href: notificationsStyles }];

const TEMPLATES_PAGE_SIZE = 10;

const HIGH_VALUE_THRESHOLD_HELP = (
  <>
    Sends the <strong>High-Value Booking</strong> admin alert when a new hire is created and the
    linked order total is at or above this amount (AUD). Use the template under Mode →{" "}
    <strong>Admin alert</strong> and set <strong>Admin notification email</strong> above. Leave
    blank or <strong>0</strong> to disable threshold checks. Totals come from Shopify when an order is
    linked; manual rentals may not alert until an order is attached.
  </>
);

const MODE_FILTER_ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ModeFilterIcon({ modeId }: { modeId: NotificationTemplateModeKey | "all" }) {
  switch (modeId) {
    case "all":
      return (
        <svg {...MODE_FILTER_ICON_PROPS}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "auto":
      return (
        <svg {...MODE_FILTER_ICON_PROPS}>
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case "scheduled":
      return (
        <svg {...MODE_FILTER_ICON_PROPS}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case "admin":
      return (
        <svg {...MODE_FILTER_ICON_PROPS}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "manual":
      return (
        <svg {...MODE_FILTER_ICON_PROPS}>
          <path d="M3 3 14.07 14.97 11.56 22.36 8.5 15.5 3 3z" />
        </svg>
      );
    default:
      return null;
  }
}

const SCHEDULED_RENTAL_TRIGGERS = new Set([
  "days_before_start",
  "on_start_date",
  "days_before_end",
  "on_end_date",
  "days_after_end",
]);

const SCHEDULED_APPOINTMENT_TRIGGERS = new Set(["days_before_appointment"]);

export type NotificationTemplateModeKey =
  | "auto"
  | "scheduled"
  | "manual"
  | "admin";

const MODE_FILTERS: Array<{
  id: NotificationTemplateModeKey | "all";
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "auto", label: "Automatic" },
  { id: "scheduled", label: "Scheduled" },
  { id: "admin", label: "Admin alert" },
  { id: "manual", label: "Manual only" },
];

function templateMode(template: NotificationTemplate): {
  key: NotificationTemplateModeKey;
  label: string;
} {
  if (!template.automated) {
    return { key: "manual", label: "Manual only" };
  }
  if (isMerchantTemplate(template)) {
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
  const [modeFilter, setModeFilter] = useState<NotificationTemplateModeKey | "all">("all");
  const [templatePage, setTemplatePage] = useState(1);

  const modeCounts = useMemo(() => {
    const counts: Record<NotificationTemplateModeKey | "all", number> = {
      all: draft.templates.length,
      auto: 0,
      scheduled: 0,
      admin: 0,
      manual: 0,
    };
    for (const template of draft.templates) {
      counts[templateMode(template).key] += 1;
    }
    return counts;
  }, [draft.templates]);

  const filteredTemplates = useMemo(() => {
    if (modeFilter === "all") {
      return draft.templates;
    }
    return draft.templates.filter(
      (template) => templateMode(template).key === modeFilter,
    );
  }, [draft.templates, modeFilter]);

  useEffect(() => {
    setTemplatePage(1);
  }, [modeFilter]);

  const templatesPagination = useMemo(
    () => buildListPagination(filteredTemplates.length, templatePage, TEMPLATES_PAGE_SIZE),
    [filteredTemplates.length, templatePage],
  );

  const pagedTemplates = useMemo(() => {
    const start = (templatesPagination.page - 1) * TEMPLATES_PAGE_SIZE;
    return filteredTemplates.slice(start, start + TEMPLATES_PAGE_SIZE);
  }, [filteredTemplates, templatesPagination.page]);

  useEffect(() => {
    if (templatePage > templatesPagination.totalPages) {
      setTemplatePage(templatesPagination.totalPages);
    }
  }, [templatePage, templatesPagination.totalPages]);

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

        <Form method="post" className="gk-notification-form">

          <input type="hidden" name="intent" value="save" />

          <div className="gk-notification-form__body">

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
                <p className="gk-notification-inline-warn" role="status">
                  Set <strong>RESEND_API_KEY</strong> and <strong>NOTIFICATION_FROM_EMAIL</strong> on
                  Railway to deliver real emails.
                </p>
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
                      setDraft((current) => ({
                        ...current,
                        enabled: readCheckValue(event, current.enabled),
                      }))
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



                <ResponsiveGrid layout="2">
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

                  <s-text-field
                    label="Admin notification email"
                    name="adminNotifyEmail"
                    value={draft.adminNotifyEmail ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        adminNotifyEmail: readFieldValue(event),
                      }))
                    }
                  />
                </ResponsiveGrid>

                <div className="gk-notification-labeled-field gk-notification-labeled-field--full">
                    <div className="gk-notification-field-label-row">
                      <label
                        className="gk-form-field__label"
                        htmlFor="admin-high-value-threshold"
                      >
                        High-value alert threshold (AUD, optional)
                      </label>
                      <InfoHoverTooltip ariaLabel="How the high-value admin alert threshold works">
                        {HIGH_VALUE_THRESHOLD_HELP}
                      </InfoHoverTooltip>
                    </div>
                    <input
                      type="hidden"
                      name="adminHighValueThresholdCents"
                      value={String(draft.adminHighValueThresholdCents ?? 0)}
                    />
                    <s-text-field
                      id="admin-high-value-threshold"
                      label="High-value alert threshold (AUD, optional)"
                      labelAccessibilityVisibility="exclusive"
                      value={
                        draft.adminHighValueThresholdCents
                          ? String(draft.adminHighValueThresholdCents / 100)
                          : ""
                      }
                      onChange={(event) => {
                        const dollars = Number.parseFloat(readFieldValue(event));
                        setDraft((current) => ({
                          ...current,
                          adminHighValueThresholdCents: Number.isFinite(dollars)
                            ? Math.max(0, Math.round(dollars * 100))
                            : 0,
                        }));
                      }}
                    />
                </div>

              </s-stack>

            </section>
          </div>

            <section className="gk-notification-panel gk-notification-templates">

              <div className="gk-notification-templates__head">

                <div>
                  <h2 className="gk-notification-panel__title">Notification templates</h2>
                  <p className="gk-notification-panel__lede gk-notification-panel__lede--tight">
                    Filter by how each email is sent. Click a row to edit copy and triggers.
                  </p>
                </div>

                <s-link href="/app/settings/notifications/new">

                  <s-button variant="primary">Add notification</s-button>

                </s-link>

              </div>

              <div className="gk-notification-templates__layout">

              <nav className="gk-notification-mode-filters" aria-label="Filter templates by mode">
                <span className="gk-notification-mode-filters__title">Mode</span>
                {MODE_FILTERS.map((filter) => {
                  const active = modeFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={`gk-notification-mode-filter${active ? " gk-notification-mode-filter--active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setModeFilter(filter.id)}
                    >
                      <span className="gk-notification-mode-filter__main">
                        <span className="gk-notification-mode-filter__icon">
                          <ModeFilterIcon modeId={filter.id} />
                        </span>
                        <span className="gk-notification-mode-filter__label">{filter.label}</span>
                      </span>
                      <span className="gk-notification-mode-filter__count">
                        {modeCounts[filter.id]}
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="gk-notification-templates__table">

              {filteredTemplates.length === 0 ? (
                <p className="gk-notification-empty-filter">
                  No templates in this mode. Choose another filter or add a notification.
                </p>
              ) : (

              <>
              <ListPaginationBar
                meta={templatesPagination}
                label="Notification templates"
                onPageChange={setTemplatePage}
              />

              <s-table variant="auto">

                <s-table-header-row>

                  <s-table-header listSlot="primary">Name</s-table-header>

                  <s-table-header listSlot="labeled">Mode</s-table-header>

                  <s-table-header listSlot="labeled">Category</s-table-header>

                  <s-table-header listSlot="labeled">When it sends</s-table-header>

                  <s-table-header listSlot="secondary">Status</s-table-header>

                </s-table-header-row>

                <s-table-body>

                  {pagedTemplates.map((template) => {
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

              <ListPaginationBar
                meta={templatesPagination}
                label="Notification templates"
                onPageChange={setTemplatePage}
              />
              </>

              )}

              </div>

              </div>

            </section>



            <input type="hidden" name="templatesJson" value={JSON.stringify(draft.templates)} />



            <div className="gk-notification-form__actions">

              <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>

                Save notification settings

              </s-button>

            </div>

          </div>

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

