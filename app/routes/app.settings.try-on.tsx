import { useEffect, useMemo, useState, type ReactNode } from "react";
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
} from "react-router";

import type { WidgetColorScheme } from "../lib/widget-colors";
import { SettingsFeatureNav } from "../components/SettingsFeatureNav";
import { SettingsSplitLayout } from "../components/SettingsSplitLayout";
import { ResponsiveGrid } from "../components/ResponsiveGrid";
import { AppointmentDurationEditor } from "../components/AppointmentDurationEditor";
import { HireTermsEditor } from "../components/HireTermsEditor";
import { DamageProtectionProductPicker } from "../components/DamageProtectionProductPicker";
import { TryOnWidgetPreview } from "../components/TryOnWidgetPreview";
import { generateSlotTemplates } from "../lib/appointment/slots";
import {
  DEFAULT_APPOINTMENT_CONFIG,
  appointmentConfigFromFormData,
  type AppointmentConfig,
} from "../lib/shop-config";
import {
  getShopAppointmentConfig,
  getShopWidgetConfig,
  saveShopAppointmentConfig,
} from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [appointment, widget] = await Promise.all([
    getShopAppointmentConfig(session.shop),
    getShopWidgetConfig(session.shop),
  ]);
  return { appointment, widgetColors: widget.colors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "reset") {
    await saveShopAppointmentConfig(session.shop, DEFAULT_APPOINTMENT_CONFIG);
    return { appointment: DEFAULT_APPOINTMENT_CONFIG, saved: true, reset: true };
  }

  const appointment = appointmentConfigFromFormData(formData);
  await saveShopAppointmentConfig(session.shop, appointment);
  return { appointment, saved: true, reset: false };
};

/** Sample Monday used for slot preview in admin. */
const PREVIEW_WEEKDAY = new Date(Date.UTC(2026, 8, 7));

function formatSlotPreviewLabel(
  config: AppointmentConfig,
  slotLabel: string,
  capacity: number,
): string {
  return `${slotLabel} / ${config.slotAvailablePluralText.replace("{count}", String(capacity))}`;
}

function SlotSchedulePreview({ config }: { config: AppointmentConfig }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Sample weekday slots</s-text>
        <s-paragraph tone="neutral" color="subdued">
          Preview for Monday {config.weekdayStart}–{config.weekdayEnd} with your
          current interval and capacity settings.
        </s-paragraph>
        {config.appointmentDurations.map((duration) => {
          const slots = generateSlotTemplates(
            PREVIEW_WEEKDAY,
            duration.minutes,
            config,
          );

          return (
            <s-stack key={duration.minutes} direction="block" gap="small">
              <s-text tone="neutral">
                {duration.label} ({duration.minutes} min)
              </s-text>
              {slots.length === 0 ? (
                <s-text tone="neutral" color="subdued">
                  No slots — check opening hours.
                </s-text>
              ) : (
                slots.slice(0, 4).map((slot) => (
                  <s-text key={`${duration.minutes}-${slot.time}`}>
                    {formatSlotPreviewLabel(config, slot.label, slot.capacity)}
                  </s-text>
                ))
              )}
              {slots.length > 4 ? (
                <s-text tone="neutral" color="subdued">
                  + {slots.length - 4} more
                </s-text>
              ) : null}
            </s-stack>
          );
        })}
      </s-stack>
    </s-box>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <s-box padding="large" background="subdued" borderRadius="large">
      <s-stack direction="block" gap="large">
        <s-stack direction="block" gap="small">
          <s-text type="strong">{title}</s-text>
          <s-paragraph tone="neutral" color="subdued">
            {description}
          </s-paragraph>
        </s-stack>
        {children}
      </s-stack>
    </s-box>
  );
}

function TryOnPreview({
  config,
  colors,
}: {
  config: AppointmentConfig;
  colors: WidgetColorScheme;
}) {
  return <TryOnWidgetPreview config={config} colors={colors} />;
}

export default function TryOnSettingsPage() {
  const { appointment: loaderAppointment, widgetColors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showSaved, setShowSaved] = useState(false);
  const [draft, setDraft] = useState<AppointmentConfig>(loaderAppointment);

  const appointment = actionData?.appointment ?? loaderAppointment;
  const isSaving =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    setDraft(appointment);
  }, [appointment]);

  useEffect(() => {
    if (actionData?.saved) {
      setShowSaved(true);
    }
  }, [actionData]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(appointment),
    [draft, appointment],
  );

  const updateDraft = (field: keyof AppointmentConfig, value: string | number) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <s-page heading="Store Front widget" inlineSize="large">
      <s-stack direction="block" gap="large">
        {showSaved ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowSaved(false)}>
            {actionData?.reset
              ? "Try-on settings reset to defaults."
              : "Try-on settings saved. Refresh your storefront to see changes."}
          </s-banner>
        ) : null}

        <SettingsFeatureNav active="try-on" />

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="calendar" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Try-on appointment settings</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Connect your Try On Appointment product once, then add the GK.Drobe
                Try-On block to gown product pages in the theme editor.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <SettingsSplitLayout
          editor={
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            <s-stack direction="block" gap="large">
              <s-box padding="large" background="base" border="base" borderRadius="large">
                <s-stack direction="block" gap="base">
                  <DamageProtectionProductPicker
                    heading="Try-on appointment product"
                    description="Choose the Try On Appointment product from your Shopify catalog. Customers book this product when using the GK.Drobe Try-On block."
                    connectedDescription="Used for try-on checkout from gown product pages and appointment pages."
                    emptyDescription="No try-on product selected yet. Pick your Try On Appointment product from Shopify."
                    chooseLabel="Choose try-on product"
                    fallbackTitle="Try-on appointment product"
                    productTitle={draft.tryOnProductTitle}
                    variantId={draft.tryOnVariantId}
                    onSelect={({ productTitle, variantId, displayPrice }) => {
                      setDraft((current) => ({
                        ...current,
                        tryOnProductTitle: productTitle,
                        tryOnVariantId: variantId,
                        tryOnPriceCents: displayPrice
                          ? Math.round(Number(displayPrice) * 100)
                          : current.tryOnPriceCents,
                      }));
                    }}
                    onClear={() => {
                      setDraft((current) => ({
                        ...current,
                        tryOnProductTitle: "",
                        tryOnVariantId: "",
                        tryOnPriceCents: 0,
                      }));
                    }}
                  />
                  {!draft.tryOnVariantId ? (
                    <s-banner tone="warning">
                      Choose your Try On Appointment product before using the widget on
                      gown pages.
                    </s-banner>
                  ) : (
                    <s-banner tone="success">
                      {draft.tryOnProductTitle || "Try-on product"} is connected for
                      storefront checkout.
                    </s-banner>
                  )}
                </s-stack>
              </s-box>

              <s-box padding="large" background="base" border="base" borderRadius="large">
                <s-text-field
                  label="Intro text"
                  name="introText"
                  value={draft.introText}
                  onChange={(event) => updateDraft("introText", event.currentTarget.value)}
                />
              </s-box>

              <SettingsSection
                title="Day options"
                description="Section heading and button labels for weekday vs weekend selection."
              >
                <s-text-field
                  label="Day section label"
                  name="dayTypeLabel"
                  value={draft.dayTypeLabel}
                  onChange={(event) => updateDraft("dayTypeLabel", event.currentTarget.value)}
                />
                <ResponsiveGrid layout="2">
                  <s-text-field
                    label="Weekday button text"
                    name="weekdayDayLabel"
                    value={draft.weekdayDayLabel}
                    onChange={(event) =>
                      updateDraft("weekdayDayLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Weekend button text"
                    name="weekendDayLabel"
                    value={draft.weekendDayLabel}
                    onChange={(event) =>
                      updateDraft("weekendDayLabel", event.currentTarget.value)
                    }
                  />
                </ResponsiveGrid>
              </SettingsSection>

              <SettingsSection
                title="Duration options"
                description="Choose which appointment lengths customers can book and how each button reads on the widget."
              >
                <s-text-field
                  label="Duration section label"
                  name="durationTypeLabel"
                  value={draft.durationTypeLabel}
                  onChange={(event) =>
                    updateDraft("durationTypeLabel", event.currentTarget.value)
                  }
                />
                <AppointmentDurationEditor
                  durations={draft.appointmentDurations}
                  onChange={(appointmentDurations) =>
                    setDraft((current) => ({ ...current, appointmentDurations }))
                  }
                />
              </SettingsSection>

              <SettingsSection
                title="Available times"
                description="Opening hours, slot intervals, capacity, and dropdown copy for time selection."
              >
                <s-text-field
                  label="Timezone label"
                  name="timezoneLabel"
                  value={draft.timezoneLabel}
                  onChange={(event) =>
                    updateDraft("timezoneLabel", event.currentTarget.value)
                  }
                />

                <s-text type="strong">Opening hours</s-text>
                <ResponsiveGrid layout="2">
                  <s-text-field
                    label="Weekday start (HH:MM)"
                    name="weekdayStart"
                    value={draft.weekdayStart}
                    onChange={(event) =>
                      updateDraft("weekdayStart", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Weekday end (HH:MM)"
                    name="weekdayEnd"
                    value={draft.weekdayEnd}
                    onChange={(event) =>
                      updateDraft("weekdayEnd", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Saturday start"
                    name="saturdayStart"
                    value={draft.saturdayStart}
                    onChange={(event) =>
                      updateDraft("saturdayStart", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Saturday end"
                    name="saturdayEnd"
                    value={draft.saturdayEnd}
                    onChange={(event) =>
                      updateDraft("saturdayEnd", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Sunday start"
                    name="sundayStart"
                    value={draft.sundayStart}
                    onChange={(event) =>
                      updateDraft("sundayStart", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Sunday end"
                    name="sundayEnd"
                    value={draft.sundayEnd}
                    onChange={(event) =>
                      updateDraft("sundayEnd", event.currentTarget.value)
                    }
                  />
                </ResponsiveGrid>

                <s-text type="strong">Slot intervals & capacity</s-text>
                <s-paragraph tone="neutral" color="subdued">
                  Interval is minutes between slot start times. A 50 minute appointment
                  with a 60 minute interval leaves a 10 minute gap between bookings.
                </s-paragraph>
                <ResponsiveGrid layout="2">
                  <s-number-field
                    label="50 min slot interval (minutes)"
                    name="slotInterval50"
                    value={String(draft.slotInterval50)}
                    min={15}
                    step={5}
                    onChange={(event) =>
                      updateDraft("slotInterval50", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="30 min slot interval (minutes)"
                    name="slotInterval30"
                    value={String(draft.slotInterval30)}
                    min={15}
                    step={5}
                    onChange={(event) =>
                      updateDraft("slotInterval30", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="20 min slot interval (minutes)"
                    name="slotInterval20"
                    value={String(draft.slotInterval20)}
                    min={15}
                    step={5}
                    onChange={(event) =>
                      updateDraft("slotInterval20", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="50 min capacity per room"
                    name="capacity50"
                    value={String(draft.capacity50)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("capacity50", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="30 min capacity per room"
                    name="capacity30"
                    value={String(draft.capacity30)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("capacity30", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="20 min capacity per room"
                    name="capacity20"
                    value={String(draft.capacity20)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("capacity20", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="Change rooms"
                    name="changeRoomCount"
                    value={String(draft.changeRoomCount)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("changeRoomCount", Number(event.currentTarget.value))
                    }
                    details="Each change room can be booked independently for the same time slot."
                  />
                </ResponsiveGrid>

                <s-text type="strong">Time slot dropdown text</s-text>
                <ResponsiveGrid layout="2">
                  <s-text-field
                    label="Time slot section label"
                    name="timeSlotLabel"
                    value={draft.timeSlotLabel}
                    onChange={(event) =>
                      updateDraft("timeSlotLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Dropdown placeholder"
                    name="slotPlaceholder"
                    value={draft.slotPlaceholder}
                    onChange={(event) =>
                      updateDraft("slotPlaceholder", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Loading text"
                    name="slotLoadingText"
                    value={draft.slotLoadingText}
                    onChange={(event) =>
                      updateDraft("slotLoadingText", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Sold out text"
                    name="slotSoldOutText"
                    value={draft.slotSoldOutText}
                    onChange={(event) =>
                      updateDraft("slotSoldOutText", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="1 space available text"
                    name="slotAvailableSingularText"
                    value={draft.slotAvailableSingularText}
                    onChange={(event) =>
                      updateDraft("slotAvailableSingularText", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Multiple spaces text (use {count})"
                    name="slotAvailablePluralText"
                    value={draft.slotAvailablePluralText}
                    onChange={(event) =>
                      updateDraft("slotAvailablePluralText", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Calendar loading text"
                    name="loadingCalendarText"
                    value={draft.loadingCalendarText}
                    onChange={(event) =>
                      updateDraft("loadingCalendarText", event.currentTarget.value)
                    }
                  />
                </ResponsiveGrid>

                <SlotSchedulePreview config={draft} />
              </SettingsSection>

              <SettingsSection
                title="Event date & style / size"
                description="Labels and placeholder for the confirm step fields."
              >
                <s-text-field
                  label="Event date label"
                  name="eventDateLabel"
                  value={draft.eventDateLabel}
                  onChange={(event) =>
                    updateDraft("eventDateLabel", event.currentTarget.value)
                  }
                />
                <s-text-field
                  label="Specific items label"
                  name="specificItemsLabel"
                  value={draft.specificItemsLabel}
                  onChange={(event) =>
                    updateDraft("specificItemsLabel", event.currentTarget.value)
                  }
                />
                <s-text-field
                  label="Style & size placeholder"
                  name="specificItemsPlaceholder"
                  value={draft.specificItemsPlaceholder}
                  onChange={(event) =>
                    updateDraft("specificItemsPlaceholder", event.currentTarget.value)
                  }
                />
              </SettingsSection>

              <SettingsSection
                title="Try-on terms & credit"
                description="Mandatory checkboxes before checkout and hire credit after paid appointments."
              >
                <HireTermsEditor
                  terms={draft.tryOnTerms}
                  onChange={(tryOnTerms) =>
                    setDraft((current) => ({
                      ...current,
                      tryOnTerms,
                    }))
                  }
                />
                <ResponsiveGrid layout="2">
                  <s-text-field
                    label="Instagram field label"
                    name="instagramLabel"
                    value={draft.instagramLabel}
                    onChange={(event) =>
                      updateDraft("instagramLabel", event.currentTarget.value)
                    }
                  />
                  <s-number-field
                    label="Credit expiry (days)"
                    name="creditExpiryDays"
                    value={String(draft.creditExpiryDays)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("creditExpiryDays", Number(event.currentTarget.value))
                    }
                  />
                  <s-text-field
                    label="Hire collection handle"
                    name="creditRedemptionCollectionHandle"
                    value={draft.creditRedemptionCollectionHandle}
                    placeholder="e.g. gown-hire"
                    details="Optional. Discount codes only apply to products in this Shopify collection. Leave blank to allow any product."
                    onChange={(event) =>
                      updateDraft(
                        "creditRedemptionCollectionHandle",
                        event.currentTarget.value,
                      )
                    }
                  />
                </ResponsiveGrid>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={draft.creditEnabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        creditEnabled: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>
                    Issue a single-use hire discount code after paid try-on appointments
                    (emailed automatically)
                  </span>
                </label>
                <s-text tone="neutral" color="subdued">
                  Codes are tied to the customer account, expire after the number of days
                  above, and are voided if the appointment order is cancelled or refunded.
                  Configure Resend in `.env` for real email delivery.
                </s-text>
              </SettingsSection>

              <SettingsSection
                title="Confirm step & buttons"
                description="Copy for the review step, availability note, and action buttons."
              >
                <s-text-field
                  label="Confirm step title"
                  name="confirmTitle"
                  value={draft.confirmTitle}
                  onChange={(event) => updateDraft("confirmTitle", event.currentTarget.value)}
                />
                <s-text-field
                  label="Confirm step subtitle"
                  name="confirmSubtitle"
                  value={draft.confirmSubtitle}
                  onChange={(event) =>
                    updateDraft("confirmSubtitle", event.currentTarget.value)
                  }
                />
                <s-text-field
                  label="Additional info heading"
                  name="additionalInfoTitle"
                  value={draft.additionalInfoTitle}
                  onChange={(event) =>
                    updateDraft("additionalInfoTitle", event.currentTarget.value)
                  }
                />
                <s-text-area
                  label="Availability note"
                  name="availabilityNote"
                  value={draft.availabilityNote}
                  rows={3}
                  onChange={(event) =>
                    updateDraft("availabilityNote", event.currentTarget.value)
                  }
                />
                <s-text-field
                  label="Availability checkbox"
                  name="availabilityCheckboxLabel"
                  value={draft.availabilityCheckboxLabel}
                  onChange={(event) =>
                    updateDraft("availabilityCheckboxLabel", event.currentTarget.value)
                  }
                />
                <ResponsiveGrid layout="2">
                  <s-text-field
                    label="Select time button"
                    name="selectTimeLabel"
                    value={draft.selectTimeLabel}
                    onChange={(event) =>
                      updateDraft("selectTimeLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Book & checkout button"
                    name="bookCheckoutLabel"
                    value={draft.bookCheckoutLabel}
                    onChange={(event) =>
                      updateDraft("bookCheckoutLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Price label"
                    name="priceLabel"
                    value={draft.priceLabel}
                    onChange={(event) =>
                      updateDraft("priceLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Back button"
                    name="backLabel"
                    value={draft.backLabel}
                    onChange={(event) =>
                      updateDraft("backLabel", event.currentTarget.value)
                    }
                  />
                </ResponsiveGrid>
              </SettingsSection>

              <div hidden aria-hidden="true">
                <input
                  type="hidden"
                  name="appointmentDurationsJson"
                  value={JSON.stringify(draft.appointmentDurations)}
                />
                <input
                  type="hidden"
                  name="tryOnTermsJson"
                  value={JSON.stringify(draft.tryOnTerms)}
                />
                <input
                  type="hidden"
                  name="creditEnabled"
                  value={draft.creditEnabled ? "true" : "false"}
                />
                <input type="hidden" name="tryOnVariantId" value={draft.tryOnVariantId} />
                <input
                  type="hidden"
                  name="tryOnProductTitle"
                  value={draft.tryOnProductTitle}
                />
                <input
                  type="hidden"
                  name="tryOnPriceCents"
                  value={String(draft.tryOnPriceCents)}
                />
              </div>

              <s-box padding="large" background="base" border="base" borderRadius="large">
                <s-stack direction="inline" gap="large" alignItems="center">
                  <s-button
                    type="submit"
                    variant="primary"
                    {...(isSaving ? { loading: true } : {})}
                  >
                    Save try-on settings
                  </s-button>
                  {isDirty ? (
                    <s-badge tone="warning">Unsaved changes</s-badge>
                  ) : (
                    <s-badge tone="success">All saved</s-badge>
                  )}
                </s-stack>
              </s-box>
            </s-stack>
          </Form>
          }
          preview={<TryOnPreview config={draft} colors={widgetColors} />}
        />

        <Form method="post">
          <s-box padding="large" background="subdued" borderRadius="large">
            <s-stack direction="inline" gap="large" alignItems="center">
              <input type="hidden" name="intent" value="reset" />
              <s-button
                type="submit"
                variant="tertiary"
                tone="critical"
                {...(isSaving ? { loading: true } : {})}
              >
                Reset try-on to defaults
              </s-button>
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
