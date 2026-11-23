import { useAppBridge } from "@shopify/app-bridge-react";

export type SelectedClutchCollection = {
  collectionId: string;
  collectionHandle: string;
  collectionTitle: string;
};

function normalizeCollectionId(value: string): string {
  const trimmed = value.trim();
  const gidMatch = trimmed.match(/Collection\/(\d+)/i);
  if (gidMatch) {
    return gidMatch[1];
  }
  return /^\d+$/.test(trimmed) ? trimmed : "";
}

type ClutchCollectionPickerProps = {
  collectionId: string;
  collectionHandle: string;
  collectionTitle: string;
  onSelect: (selection: SelectedClutchCollection) => void;
  onClear: () => void;
};

export function ClutchCollectionPicker({
  collectionId,
  collectionHandle,
  collectionTitle,
  onSelect,
  onClear,
}: ClutchCollectionPickerProps) {
  const shopify = useAppBridge();

  async function openCollectionPicker() {
    const selected = await shopify.resourcePicker({
      type: "collection",
      multiple: false,
    });

    if (!selected?.length) {
      return;
    }

    const collection = selected[0] as {
      id?: string;
      handle?: string;
      title?: string;
    };

    const nextId = normalizeCollectionId(collection.id ?? "");
    if (!nextId) {
      return;
    }

    onSelect({
      collectionId: nextId,
      collectionHandle: String(collection.handle ?? "").trim(),
      collectionTitle: String(collection.title ?? "Collection").trim(),
    });
  }

  const connected = Boolean(collectionId);

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Clutch collection</s-text>
      <s-paragraph tone="neutral" color="subdued">
        Choose the Shopify collection that lists hire clutches. The cart pop-up loads
        products from this collection only.
      </s-paragraph>

      {connected ? (
        <s-box padding="base" background="subdued" borderRadius="base" border="base">
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-badge tone="success">Connected</s-badge>
              <s-text type="strong">{collectionTitle || "Collection"}</s-text>
            </s-stack>
            {collectionHandle ? (
              <s-text tone="neutral" color="subdued">
                Handle: {collectionHandle}
              </s-text>
            ) : null}
            <s-stack direction="inline" gap="small">
              <s-button type="button" variant="secondary" onClick={openCollectionPicker}>
                Change collection
              </s-button>
              <s-button type="button" variant="tertiary" tone="critical" onClick={onClear}>
                Remove
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      ) : (
        <s-button type="button" variant="primary" icon="collection" onClick={openCollectionPicker}>
          Choose collection
        </s-button>
      )}
    </s-stack>
  );
}