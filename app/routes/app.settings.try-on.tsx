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
  const slots50 = generateSlotTemplates(PREVIEW_WEEKDAY, 50, config);
  const slots20 = generateSlotTemplates(PREVIEW_WEEKDAY, 20, config);

  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text type="strong">Sample weekday slots</s-text>
        <s-paragraph tone="neutral" color="subdued">
          Preview for Monday {config.weekdayStart}–{config.weekdayEnd} with your
          current interval and capacity settings.
        </s-paragraph>
        <s-stack direction="block" gap="small">
          <s-text tone="neutral">50 minute ({config.slotInterval50} min interval)</s-text>
          {slots50.length === 0 ? (
            <s-text tone="neutral" color="subdued">No slots — check opening hours.</s-text>
          ) : (
            slots50.slice(0, 6).map((slot) => (
              <s-text key={slot.time}>{formatSlotPreviewLabel(config, slot.label, slot.capacity)}</s-text>
            ))
          )}
          {slots50.length > 6 ? (
            <s-text tone="neutral" color="subdued">+ {slots50.length - 6} more</s-text>
          ) : null}
        </s-stack>
        <s-stack direction="block" gap="small">
          <s-text tone="neutral">20 minute ({config.slotInterval20} min interval)</s-text>
          {slots20.length === 0 ? (
            <s-text tone="neutral" color="subdued">No slots — check opening hours.</s-text>
          ) : (
            slots20.slice(0, 6).map((slot) => (
              <s-text key={slot.time}>{formatSlotPreviewLabel(config, slot.label, slot.capacity)}</s-text>
            ))
          )}
          {slots20.length > 6 ? (
            <s-text tone="neutral" color="subdued">+ {slots20.length - 6} more</s-text>
          ) : null}
        </s-stack>
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
    <s-page heading="Try-on" inlineSize="large">
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
                Edit day and duration labels, available time slots, event date copy,
                and style/size placeholder text for the GK.Drobe Try-On block.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <s-grid gridTemplateColumns="1.4fr 1fr" gap="large" alignItems="start">
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            <s-stack direction="block" gap="large">
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
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
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
                </s-grid>
              </SettingsSection>

              <SettingsSection
                title="Duration options"
                description="Section heading and button labels for 50 minute vs 20 minute appointments."
              >
                <s-text-field
                  label="Duration section label"
                  name="durationTypeLabel"
                  value={draft.durationTypeLabel}
                  onChange={(event) =>
                    updateDraft("durationTypeLabel", event.currentTarget.value)
                  }
                />
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
                  <s-text-field
                    label="50 minute button text"
                    name="duration50Label"
                    value={draft.duration50Label}
                    onChange={(event) =>
                      updateDraft("duration50Label", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="20 minute button text"
                    name="duration20Label"
                    value={draft.duration20Label}
                    onChange={(event) =>
                      updateDraft("duration20Label", event.currentTarget.value)
                    }
                  />
                </s-grid>
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
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
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
                </s-grid>

                <s-text type="strong">Slot intervals & capacity</s-text>
                <s-paragraph tone="neutral" color="subdued">
                  Interval is minutes between slot start times. A 50 minute appointment
                  with a 60 minute interval leaves a 10 minute gap between bookings.
                </s-paragraph>
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
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
                    label="50 min capacity per slot"
                    name="capacity50"
                    value={String(draft.capacity50)}
                    min={1}
                    step={1}
                    onChange={(event) =>
                      updateDraft("capacity50", Number(event.currentTarget.value))
                    }
                  />
                  <s-number-field
                    label="20 min capacity per slot"
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
                  />
                </s-grid>

                <s-text type="strong">Time slot dropdown text</s-text>
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
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
                </s-grid>

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
                <s-grid gridTemplateColumns="1fr 1fr" gap="large">
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
                </s-grid>
              </SettingsSection>

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

          <TryOnPreview config={draft} colors={widgetColors} />
        </s-grid>

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
