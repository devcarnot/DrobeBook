import {
  DEFAULT_APPOINTMENT_DURATIONS,
  formatAppointmentDurationLabel,
  MAX_APPOINTMENT_DURATION_MINUTES,
  MAX_APPOINTMENT_DURATION_OPTIONS,
  MIN_APPOINTMENT_DURATION_MINUTES,
  type AppointmentDurationOption,
} from "../lib/appointment/appointment-durations";

export function AppointmentDurationEditor({
  durations,
  onChange,
}: {
  durations: AppointmentDurationOption[];
  onChange: (durations: AppointmentDurationOption[]) => void;
}) {
  function updateDuration(
    index: number,
    field: "minutes" | "label",
    value: string,
  ) {
    onChange(
      durations.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        if (field === "minutes") {
          const minutes = Number.parseInt(value, 10);
          const nextMinutes = Number.isFinite(minutes) ? minutes : entry.minutes;
          return {
            ...entry,
            minutes: nextMinutes,
            label: entry.label || formatAppointmentDurationLabel(nextMinutes),
          };
        }

        return { ...entry, label: value };
      }),
    );
  }

  function addDuration() {
    if (durations.length >= MAX_APPOINTMENT_DURATION_OPTIONS) {
      return;
    }

    const usedMinutes = new Set(durations.map((entry) => entry.minutes));
    const nextMinutes =
      DEFAULT_APPOINTMENT_DURATIONS.map((entry) => entry.minutes).find(
        (minutes) => !usedMinutes.has(minutes),
      ) ??
      Array.from(
        { length: MAX_APPOINTMENT_DURATION_MINUTES },
        (_, index) => index + MIN_APPOINTMENT_DURATION_MINUTES,
      ).find((minutes) => !usedMinutes.has(minutes)) ??
      durations.length + MIN_APPOINTMENT_DURATION_MINUTES;

    onChange([
      ...durations,
      {
        minutes: nextMinutes,
        label: formatAppointmentDurationLabel(nextMinutes),
      },
    ]);
  }

  function removeDuration(index: number) {
    if (durations.length <= 1) {
      return;
    }

    onChange(durations.filter((_, entryIndex) => entryIndex !== index));
  }

  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Add or remove appointment lengths shown on the try-on widget. Each option
        needs a duration in minutes and the button label customers see.
      </s-text>

      {durations.map((duration, index) => (
        <s-box
          key={`${duration.minutes}-${index}`}
          padding="base"
          background="subdued"
          border="base"
          borderRadius="base"
        >
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-number-field
              label={`Duration ${index + 1} (minutes)`}
              value={String(duration.minutes)}
              min={MIN_APPOINTMENT_DURATION_MINUTES}
              max={MAX_APPOINTMENT_DURATION_MINUTES}
              onChange={(event) =>
                updateDuration(index, "minutes", event.currentTarget.value)
              }
            />
            <s-text-field
              label="Button label"
              value={duration.label}
              placeholder={formatAppointmentDurationLabel(duration.minutes)}
              onChange={(event) =>
                updateDuration(index, "label", event.currentTarget.value)
              }
            />
            <s-button
              type="button"
              variant="tertiary"
              tone="critical"
              disabled={durations.length <= 1}
              onClick={() => removeDuration(index)}
            >
              Remove
            </s-button>
          </s-stack>
        </s-box>
      ))}

      <s-button
        type="button"
        variant="secondary"
        disabled={durations.length >= MAX_APPOINTMENT_DURATION_OPTIONS}
        onClick={addDuration}
      >
        Add duration
      </s-button>
    </s-stack>
  );
}
