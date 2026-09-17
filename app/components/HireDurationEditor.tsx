import {
  DEFAULT_HIRE_DURATIONS,
  formatHireDurationLabel,
  MAX_HIRE_DURATION_DAYS,
  MAX_HIRE_DURATION_OPTIONS,
  MIN_HIRE_DURATION_DAYS,
  type HireDurationOption,
} from "../lib/hire-durations";

export function HireDurationEditor({
  durations,
  onChange,
}: {
  durations: HireDurationOption[];
  onChange: (durations: HireDurationOption[]) => void;
}) {
  function updateDuration(index: number, field: "days" | "label", value: string) {
    onChange(
      durations.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        if (field === "days") {
          const days = Number.parseInt(value, 10);
          const nextDays = Number.isFinite(days) ? days : entry.days;
          return {
            ...entry,
            days: nextDays,
            label: entry.label || formatHireDurationLabel(nextDays),
          };
        }

        return { ...entry, label: value };
      }),
    );
  }

  function addDuration() {
    if (durations.length >= MAX_HIRE_DURATION_OPTIONS) {
      return;
    }

    const usedDays = new Set(durations.map((entry) => entry.days));
    const nextDays =
      DEFAULT_HIRE_DURATIONS.map((entry) => entry.days).find(
        (days) => !usedDays.has(days),
      ) ??
      Array.from({ length: MAX_HIRE_DURATION_DAYS }, (_, index) => index + 1).find(
        (days) => !usedDays.has(days),
      ) ??
      durations.length + 1;

    onChange([
      ...durations,
      {
        days: nextDays,
        label: formatHireDurationLabel(nextDays),
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
        These buttons and calendar hire length use the day counts you set here.
        Each duration must match a Shopify Duration variant on your rental
        products (for example 5 days needs a &quot;5 Days&quot; variant).
      </s-text>

      {durations.map((duration, index) => (
        <s-box
          key={`${duration.days}-${index}`}
          padding="base"
          background="subdued"
          border="base"
          borderRadius="base"
        >
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-number-field
              label={`Duration ${index + 1} (days)`}
              value={String(duration.days)}
              min={MIN_HIRE_DURATION_DAYS}
              max={MAX_HIRE_DURATION_DAYS}
              onChange={(event) => updateDuration(index, "days", event.currentTarget.value)}
            />
            <s-text-field
              label="Button label"
              value={duration.label}
              placeholder={formatHireDurationLabel(duration.days)}
              onChange={(event) => updateDuration(index, "label", event.currentTarget.value)}
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
        disabled={durations.length >= MAX_HIRE_DURATION_OPTIONS}
        onClick={addDuration}
      >
        Add duration
      </s-button>
    </s-stack>
  );
}
