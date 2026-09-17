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

  processScheduledRentalNotifications,

  saveNotificationsConfig,

} from "../lib/notifications/notification.server";

import { authenticate } from "../shopify.server";

import { boundary } from "@shopify/shopify-app-react-router/server";



export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { session } = await authenticate.admin(request);

  const notifications = await getNotificationsConfig(session.shop);

  await processScheduledRentalNotifications(session.shop).catch(() => undefined);



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

    const result = await processScheduledRentalNotifications(session.shop);

    return { saved: false, scheduled: result };

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

  if (!template.automated || !template.active) {

    return "Inactive";

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

      <s-stack direction="block" gap="large">

        {actionData?.saved ? (

          <s-banner tone="success">Notification settings saved.</s-banner>

        ) : null}

        {actionData?.scheduled ? (

          <s-banner tone="info">

            Checked scheduled notifications — processed {actionData.scheduled.processed}, sent{" "}

            {actionData.scheduled.sent}.

          </s-banner>

        ) : null}



        <s-box padding="large" background="subdued" borderRadius="large">

          <div className="gk-notification-hero">

            <div className="gk-notification-hero__icon" aria-hidden="true">

              ✉

            </div>

            <s-stack direction="block" gap="small">

              <s-text type="strong">Automated customer emails</s-text>

              <s-paragraph tone="neutral" color="subdued">

                Send rental confirmations, dispatch updates, return reminders, waitlist alerts, and

                after-rental messages. Templates support tokens like {"{{customerFirstName}}"} and{" "}

                {"{{rentalStartDate}}"}.

              </s-paragraph>

              <s-text tone="neutral" color="subdued">

                {activeCount} active template{activeCount === 1 ? "" : "s"} configured.

              </s-text>

            </s-stack>

          </div>

          {!hasResend ? (

            <s-banner tone="warning">

              Set <s-text type="strong">RESEND_API_KEY</s-text> and{" "}

              <s-text type="strong">NOTIFICATION_FROM_EMAIL</s-text> in your app environment to

              deliver emails. Without them, messages are logged in the server console for testing.

            </s-banner>

          ) : null}

        </s-box>



        <Form method="post">

          <input type="hidden" name="intent" value="save" />

          <s-stack direction="block" gap="large">

            <s-box padding="large" background="base" border="base" borderRadius="large">

              <s-stack direction="block" gap="large">

                <s-stack direction="block" gap="small">

                  <s-text type="strong">Sender details</s-text>

                  <s-paragraph tone="neutral" color="subdued">

                    These details appear in the From and Reply-To headers for customer emails.

                  </s-paragraph>

                </s-stack>



                <label className="gk-toggle-row">

                  <input

                    type="checkbox"

                    name="enabled"

                    value="true"

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

                        fromName: event.currentTarget.value,

                      }))

                    }

                  />

                  <s-text-field

                    label="From email"

                    name="fromEmail"

                    value={draft.fromEmail}

                    placeholder={defaultFromEmail || "notifications@yourdomain.com"}

                    onChange={(event) =>

                      setDraft((current) => ({

                        ...current,

                        fromEmail: event.currentTarget.value,

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

                      replyToEmail: event.currentTarget.value,

                    }))

                  }

                />

              </s-stack>

            </s-box>



            <s-box padding="large" background="base" border="base" borderRadius="large">

              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">

                <s-stack direction="block" gap="small">

                  <s-text type="strong">Notification templates</s-text>

                  <s-text tone="neutral" color="subdued">

                    Click a template to edit its schedule, delivery methods, and email copy.

                  </s-text>

                </s-stack>

                <s-link href="/app/settings/notifications/new">

                  <s-button variant="primary">Add notification</s-button>

                </s-link>

              </s-stack>



              <s-table variant="auto">

                <s-table-header-row>

                  <s-table-header listSlot="primary">Name</s-table-header>

                  <s-table-header listSlot="labeled">Category</s-table-header>

                  <s-table-header listSlot="labeled">Schedule</s-table-header>

                  <s-table-header listSlot="secondary">Status</s-table-header>

                </s-table-header-row>

                <s-table-body>

                  {draft.templates.map((template) => (

                    <s-table-row key={template.id}>

                      <s-table-cell>

                        <s-link href={`/app/settings/notifications/${template.id}`}>

                          {template.name}

                        </s-link>

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

                  ))}

                </s-table-body>

              </s-table>

            </s-box>



            <input type="hidden" name="templatesJson" value={JSON.stringify(draft.templates)} />



            <s-stack direction="inline" gap="base">

              <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>

                Save notification settings

              </s-button>

            </s-stack>

          </s-stack>

        </Form>



        <Form method="post">

          <input type="hidden" name="intent" value="run-scheduled" />

          <s-box padding="large" background="subdued" borderRadius="large">

            <s-stack direction="block" gap="base">

              <s-text type="strong">Scheduled reminders</s-text>

              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">

                <s-text tone="neutral" color="subdued">

                  Run due date-based reminders now (return reminders, rental start info, after-rental).

                </s-text>

                <s-button type="submit" variant="secondary">

                  Run scheduled notifications

                </s-button>

              </s-stack>

            </s-stack>

          </s-box>

        </Form>

      </s-stack>

    </s-page>

  );

}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};

