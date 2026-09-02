type SettingsFeature = "gown-hire" | "try-on" | "search";

const FEATURES: Array<{ id: SettingsFeature; label: string; href: string }> = [
  { id: "gown-hire", label: "Gown Hire", href: "/app/settings" },
  { id: "try-on", label: "Try-on", href: "/app/settings/try-on" },
  { id: "search", label: "Search", href: "/app/settings/search" },
];

export function SettingsFeatureNav({ active }: { active: SettingsFeature }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="large">
      <s-stack direction="inline" gap="small">
        {FEATURES.map((feature) =>
          feature.id === active ? (
            <s-badge key={feature.id} tone="info">
              {feature.label}
            </s-badge>
          ) : (
            <s-link key={feature.id} href={feature.href}>
              {feature.label}
            </s-link>
          ),
        )}
      </s-stack>
    </s-box>
  );
}
