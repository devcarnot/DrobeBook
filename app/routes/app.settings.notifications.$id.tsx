import { useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useLoaderData, useNavigation } from "react-router";

import { NotificationEmailPreview } from "../components/NotificationEmailPreview";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { SettingsSplitLayout } from "../components/SettingsSplitLayout";
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_TOKENS,
  NOTIFICATION_TRIGGER_LABELS,
  type NotificationCategory,
  type NotificationDeliveryMethod,
  type NotificationTrigger,
} from "../lib/notifications/notification.types";
import {
  getNotificationsConfig,
  notificationTemplateFromFormData,
  saveNotificationsConfig,
} from "../lib/notifications/notification.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const CATEGORY_OPTIONS = Object.entries(NOTIFICATION_CATEGORY_LABELS) as Array<
  [NotificationCategory, string]
>;
const TRIGGER_OPTIONS = Object.entries(NOTIFICATION_TRIGGER_LABELS) as Array<
  [NotificationTrigger, string]
>;

const DELIVERY_METHODS: Array<{
  id: NotificationDeliveryMethod;
  title: string;
  description: string;
}> = [
  { id: "post", title: "Post (Shipping)", description: "Shipped rentals" },
  { id: "pickup", title: "Customer pickup", description: "In-store collection" },
  { id: "local", title: "Local delivery", description: "Same-day courier" },
];

function SettingsSection({
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
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text type="strong">{title}</s-text>
          {description ? (
            <s-paragraph tone="neutral" color="subdued">
              {description}
            </s-paragraph>
          ) : null}
        </s-stack>
        {children}
      </s-stack>
    </s-box>
  );
}

function scheduleSummary(template: {
  automated: boolean;
  active: boolean;
  trigger: NotificationTrigger;
  offsetDays: number;
}) {
  if (!template.automated || !template.active) {
    return "Manual or inactive";
  }

  const trigger = NOTIFICATION_TRIGGER_LABELS[template.trigger];
  if (template.offsetDays === 0) {
    return trigger;
  }

  return `${template.offsetDays > 0 ? "+" : ""}${template.offsetDays} days · ${trigger}`;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const notifications = await getNotificationsConfig(session.shop);
  const isNew = params.id === "new";

  const template = isNew
    ? {
        id: crypto.randomUUID(),
        name: "",
        category: "rental_created" as NotificationCategory,
        deliveryMethods: ["post", "pickup", "local"] as NotificationDeliveryMethod[],
        channel: "email" as const,
        subject: "",
        body: "",
        automated: false,
        trigger: "manual" as NotificationTrigger,
        offsetDays: 0,
        active: false,
      }
    : notifications.templates.find((entry) => entry.id === params.id);

  if (!template) {
    throw new Response("Notification not found", { status: 404 });
  }

  return { template, isNew, tokens: NOTIFICATION_TOKENS, fromName: notifications.fromName };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");
  const notifications = await getNotificationsConfig(session.shop);
  const existing = notifications.templates.find((entry) => entry.id === params.id);

  if (intent === "delete" && existing) {
    await saveNotificationsConfig(session.shop, {
      ...notifications,
      templates: notifications.templates.filter((entry) => entry.id !== existing.id),
    });
    return redirect("/app/settings/notifications");
  }

  const template = notificationTemplateFromFormData(formData, existing);
  const templates = existing
    ? notifications.templates.map((entry) =>
        entry.id === template.id ? template : entry,
      )
    : [...notifications.templates, template];

  await saveNotificationsConfig(session.shop, {
    ...notifications,
    templates,
  });

  return redirect("/app/settings/notifications");
};

export default function NotificationEditPage() {
  const { template, isNew, tokens, fromName } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state !== "idle";
  const [showTokens, setShowTokens] = useState(false);
  const [draft, setDraft] = useState(template);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const deliveryMethods = useMemo(
    () => new Set(draft.deliveryMethods),
    [draft.deliveryMethods],
  );

  function toggleDeliveryMethod(method: NotificationDeliveryMethod) {
    setDraft((current) => {
      const next = new Set(current.deliveryMethods);
      if (next.has(method)) {
        if (next.size === 1) {
          return current;
        }
        next.delete(method);
      } else {
        next.add(method);
      }
      return {
        ...current,
        deliveryMethods: [...next],
      };
    });
  }

  function insertToken(token: string) {
    const field = bodyRef.current;
    if (!field) {
      setDraft((current) => ({ ...current, body: `${current.body}${token}` }));
      return;
    }

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const nextBody = `${field.value.slice(0, start)}${token}${field.value.slice(end)}`;
    setDraft((current) => ({ ...current, body: nextBody }));

    requestAnimationFrame(() => {
      field.focus();
      const cursor = start + token.length;
      field.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <s-page
      heading={isNew ? "Add notification" : draft.name || "Edit notification"}
      inlineSize="large"
    >
      <s-stack direction="block" gap="large">
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-link href="/app/settings/notifications">← Back to notifications</s-link>
          <div className="gk-notification-status-row">
            <s-badge tone={draft.active ? "success" : "neutral"}>
              {draft.active ? "Active" : "Inactive"}
            </s-badge>
            {draft.automated ? <s-badge tone="info">Automated</s-badge> : null}
          </div>
        </s-stack>

        <s-box padding="large" background="subdued" borderRadius="large">
          <div className="gk-notification-hero">
            <div className="gk-notification-hero__icon" aria-hidden="true">
              ✉
            </div>
            <s-stack direction="block" gap="small">
              <s-text type="strong">
                {isNew ? "Create a customer email template" : "Edit email template"}
              </s-text>
              <s-paragraph tone="neutral" color="subdued">
                Configure when this message sends, which delivery methods it applies to, and the
                email copy customers receive.
              </s-paragraph>
            </s-stack>
          </div>
        </s-box>

        <Form method="post">
          <input type="hidden" name="id" value={draft.id} />
          <SettingsSplitLayout
            editor={
              <s-stack direction="block" gap="large">
                <SettingsSection
                  title="Template details"
                  description="Internal name and category used when sending manually from rental screens."
                >
                  <s-text-field
                    label="Name"
                    name="name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.currentTarget.value }))
                    }
                  />
                  <div className="gk-form-field">
                    <label className="gk-form-field__label" htmlFor="notification-category">
                      Category
                    </label>
                    <select
                      id="notification-category"
                      className="gk-select"
                      name="category"
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          category: event.currentTarget.value as NotificationCategory,
                        }))
                      }
                    >
                      {CATEGORY_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="Delivery methods"
                  description="Only rentals using the selected delivery methods will receive this notification."
                >
                  <div className="gk-delivery-chips">
                    {DELIVERY_METHODS.map((method) => {
                      const selected = deliveryMethods.has(method.id);
                      return (
                        <button
                          key={method.id}
                          type="button"
                          className={`gk-delivery-chip${selected ? " gk-delivery-chip--selected" : ""}`}
                          onClick={() => toggleDeliveryMethod(method.id)}
                        >
                          <span className="gk-delivery-chip__title">{method.title}</span>
                          <span className="gk-delivery-chip__desc">{method.description}</span>
                        </button>
                      );
                    })}
                  </div>
                  {(["post", "pickup", "local"] as NotificationDeliveryMethod[]).map((method) =>
                    deliveryMethods.has(method) ? (
                      <input
                        key={method}
                        type="checkbox"
                        name="deliveryMethods"
                        value={method}
                        checked
                        readOnly
                        hidden
                      />
                    ) : null,
                  )}
                </SettingsSection>

                <SettingsSection
                  title="Automation"
                  description="Control whether this template sends automatically and when it should trigger."
                >
                  <label className="gk-toggle-row">
                    <input
                      type="checkbox"
                      name="automated"
                      value="true"
                      checked={draft.automated}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          automated: event.currentTarget.checked,
                        }))
                      }
                    />
                    <span className="gk-toggle-row__copy">
                      <span className="gk-toggle-row__title">
                        Activate automated schedule
                      </span>
                      <span className="gk-toggle-row__desc">
                        Send automatically based on the trigger and offset below.
                      </span>
                    </span>
                  </label>

                  <label className="gk-toggle-row">
                    <input
                      type="checkbox"
                      name="active"
                      value="true"
                      checked={draft.active}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          active: event.currentTarget.checked,
                        }))
                      }
                    />
                    <span className="gk-toggle-row__copy">
                      <span className="gk-toggle-row__title">Active template</span>
                      <span className="gk-toggle-row__desc">
                        Inactive templates are ignored for automated sends and manual pickers.
                      </span>
                    </span>
                  </label>

                  <ResponsiveGrid layout="2">
                    <div className="gk-form-field">
                      <label className="gk-form-field__label" htmlFor="notification-trigger">
                        Trigger
                      </label>
                      <select
                        id="notification-trigger"
                        className="gk-select"
                        name="trigger"
                        value={draft.trigger}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            trigger: event.currentTarget.value as NotificationTrigger,
                          }))
                        }
                      >
                        {TRIGGER_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <s-text-field
                      label="Offset days"
                      name="offsetDays"
                      value={String(draft.offsetDays)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          offsetDays: Number.parseInt(event.currentTarget.value, 10) || 0,
                        }))
                      }
                    />
                  </ResponsiveGrid>

                  {draft.trigger === "on_status_change" ? (
                    <s-text-field
                      label="Workflow status"
                      name="workflowStatus"
                      value={draft.workflowStatus ?? ""}
                      placeholder="dispatched, returned, cancelled..."
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          workflowStatus: event.currentTarget.value,
                        }))
                      }
                    />
                  ) : null}
                </SettingsSection>

                <SettingsSection
                  title="Email content"
                  description="Write the subject and body. Click a token to insert dynamic customer and rental data."
                >
                  <s-text-field
                    label="Email subject"
                    name="subject"
                    value={draft.subject}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, subject: event.currentTarget.value }))
                    }
                  />

                  <div className="gk-form-field">
                    <label className="gk-form-field__label" htmlFor="notification-body">
                      Message body
                    </label>
                    <textarea
                      ref={bodyRef}
                      id="notification-body"
                      className="gk-textarea"
                      name="body"
                      rows={14}
                      value={draft.body}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, body: event.currentTarget.value }))
                      }
                    />
                    <span className="gk-form-field__hint">
                      Plain text is supported. Line breaks are preserved in the email.
                    </span>
                  </div>

                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowTokens((value) => !value)}
                  >
                    {showTokens ? "Hide template tokens" : "Show template tokens"}
                  </s-button>

                  {showTokens ? (
                    <div className="gk-token-panel">
                      <s-text tone="neutral" color="subdued">
                        Click a token to insert it into the message body.
                      </s-text>
                      <div className="gk-token-grid">
                        {tokens.map((entry) => (
                          <button
                            key={entry.token}
                            type="button"
                            className="gk-token-chip"
                            onClick={() => insertToken(entry.token)}
                          >
                            <code>{entry.token}</code>
                            <span>{entry.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </SettingsSection>

                <div className="gk-notification-actions">
                  <div className="gk-notification-actions__primary">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isSaving ? { loading: true } : {})}
                    >
                      Save notification
                    </s-button>
                  </div>
                  {!isNew ? (
                    <button type="submit" name="intent" value="delete" className="gk-notification-delete">
                      Delete notification
                    </button>
                  ) : null}
                </div>
              </s-stack>
            }
            preview={
              <s-stack direction="block" gap="large">
                <s-box padding="large" background="base" border="base" borderRadius="large">
                  <s-stack direction="block" gap="base">
                    <s-text type="strong">Live preview</s-text>
                    <s-paragraph tone="neutral" color="subdued">
                      Sample customer data is used so you can review the final email before saving.
                    </s-paragraph>
                    <NotificationEmailPreview
                      subject={draft.subject}
                      body={draft.body}
                      shopName={fromName || "GK.Drobe"}
                    />
                  </s-stack>
                </s-box>

                <s-box padding="large" background="subdued" borderRadius="large">
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">Schedule summary</s-text>
                    <s-text tone="neutral" color="subdued">
                      {scheduleSummary(draft)}
                    </s-text>
                    <s-text tone="neutral" color="subdued">
                      Category: {NOTIFICATION_CATEGORY_LABELS[draft.category]}
                    </s-text>
                    <s-text tone="neutral" color="subdued">
                      Delivery:{" "}
                      {draft.deliveryMethods
                        .map(
                          (method) =>
                            DELIVERY_METHODS.find((entry) => entry.id === method)?.title ?? method,
                        )
                        .join(", ")}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-stack>
            }
          />
        </Form>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
