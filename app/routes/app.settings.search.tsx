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
} from "react-router";

import { ColorField } from "../components/ColorField";
import { SearchWidgetPreview } from "../components/SearchWidgetPreview";
import { SettingsFeatureNav } from "../components/SettingsFeatureNav";
import {
  DEFAULT_SEARCH_CONFIG,
  searchConfigFromFormData,
  type SearchConfig,
} from "../lib/shop-config";
import {
  SEARCH_COLOR_FIELDS,
  type SearchColorScheme,
} from "../lib/search-colors";
import {
  getShopSearchConfig,
  saveShopSearchConfig,
} from "../lib/shop-settings.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const search = await getShopSearchConfig(session.shop);
  return { search };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "reset") {
    await saveShopSearchConfig(session.shop, DEFAULT_SEARCH_CONFIG);
    return { search: DEFAULT_SEARCH_CONFIG, saved: true, reset: true };
  }

  const search = searchConfigFromFormData(formData);
  await saveShopSearchConfig(session.shop, search);
  return { search, saved: true, reset: false };
};

function SearchColorHiddenFields({ colors }: { colors: SearchColorScheme }) {
  return (
    <div hidden aria-hidden="true">
      {SEARCH_COLOR_FIELDS.map(({ key }) => (
        <input key={key} type="hidden" name={`color_${key}`} value={colors[key]} />
      ))}
    </div>
  );
}

export default function SearchSettingsPage() {
  const { search: loaderSearch } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showSaved, setShowSaved] = useState(false);
  const [draft, setDraft] = useState<SearchConfig>(loaderSearch);

  const search = actionData?.search ?? loaderSearch;
  const isSaving =
    navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    setDraft(search);
  }, [search]);

  useEffect(() => {
    if (actionData?.saved) {
      setShowSaved(true);
    }
  }, [actionData]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(search),
    [draft, search],
  );

  const updateDraft = (field: keyof SearchConfig, value: string | number) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateDraftColor = (field: keyof SearchColorScheme, value: string) => {
    setDraft((current) => ({
      ...current,
      colors: { ...current.colors, [field]: value },
    }));
  };

  return (
    <s-page heading="Search" inlineSize="large">
      <s-stack direction="block" gap="large">
        {showSaved ? (
          <s-banner tone="success" dismissible onDismiss={() => setShowSaved(false)}>
            {actionData?.reset
              ? "Search settings reset to defaults."
              : "Search settings saved. Refresh your storefront to see changes."}
          </s-banner>
        ) : null}

        <SettingsFeatureNav active="search" />

        <s-box padding="large" background="subdued" borderRadius="large">
          <s-stack direction="inline" gap="large" alignItems="start">
            <s-icon type="search" />
            <s-stack direction="block" gap="small">
              <s-text type="strong">Search by date</s-text>
              <s-paragraph tone="neutral" color="subdued">
                Edit page copy, size dropdown options, and the search form color
                scheme for the GK.Drobe Search By Date section.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-box>

        <s-grid gridTemplateColumns="1.4fr 1fr" gap="large" alignItems="start">
          <Form method="post">
            <input type="hidden" name="intent" value="save" />
            <s-stack direction="block" gap="large">
              <s-box padding="large" background="base" border="base" borderRadius="large">
                <s-stack direction="block" gap="large">
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">Page & form text</s-text>
                    <s-paragraph tone="neutral" color="subdued">
                      These fields control the centered search form on your storefront.
                    </s-paragraph>
                  </s-stack>

                  <s-text-field
                    label="Page title"
                    name="pageTitle"
                    value={draft.pageTitle}
                    onChange={(event) => updateDraft("pageTitle", event.currentTarget.value)}
                  />
                  <s-text-field
                    label="Search button label"
                    name="formButtonLabel"
                    value={draft.formButtonLabel}
                    onChange={(event) =>
                      updateDraft("formButtonLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="Results page URL"
                    name="resultsPageUrl"
                    value={draft.resultsPageUrl}
                    onChange={(event) =>
                      updateDraft("resultsPageUrl", event.currentTarget.value)
                    }
                    details='Landing search form redirects here, e.g. /pages/search-by-date'
                  />
                  <s-grid gridTemplateColumns="1fr 1fr" gap="large">
                    <s-text-field
                      label="Event date label"
                      name="eventDateLabel"
                      value={draft.eventDateLabel}
                      onChange={(event) =>
                        updateDraft("eventDateLabel", event.currentTarget.value)
                      }
                    />
                    <s-text-field
                      label="Size label"
                      name="sizeLabel"
                      value={draft.sizeLabel}
                      onChange={(event) => updateDraft("sizeLabel", event.currentTarget.value)}
                    />
                    <s-text-field
                      label="Size placeholder"
                      name="sizePlaceholder"
                      value={draft.sizePlaceholder}
                      onChange={(event) =>
                        updateDraft("sizePlaceholder", event.currentTarget.value)
                      }
                    />
                    <s-text-field
                      label="Size options (comma separated)"
                      name="sizeOptions"
                      value={draft.sizeOptions}
                      onChange={(event) =>
                        updateDraft("sizeOptions", event.currentTarget.value)
                      }
                      details='e.g. "4,6,8,10,12,14"'
                    />
                    <s-text-field
                      label="Refine search button"
                      name="refineSearchLabel"
                      value={draft.refineSearchLabel}
                      onChange={(event) =>
                        updateDraft("refineSearchLabel", event.currentTarget.value)
                      }
                    />
                  </s-grid>
                  <s-text-field
                    label="Loading message"
                    name="loadingLabel"
                    value={draft.loadingLabel}
                    onChange={(event) =>
                      updateDraft("loadingLabel", event.currentTarget.value)
                    }
                  />
                  <s-text-field
                    label="No results message"
                    name="emptyResultsLabel"
                    value={draft.emptyResultsLabel}
                    onChange={(event) =>
                      updateDraft("emptyResultsLabel", event.currentTarget.value)
                    }
                  />
                </s-stack>
              </s-box>

              <s-box padding="large" background="subdued" borderRadius="large">
                <s-stack direction="block" gap="large">
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">Color scheme</s-text>
                    <s-paragraph tone="neutral" color="subdued">
                      Colors for the page title, labels, inputs, and search button.
                    </s-paragraph>
                  </s-stack>

                  <s-box padding="large" background="base" border="base" borderRadius="base">
                    <s-stack direction="block" gap="none">
                      {SEARCH_COLOR_FIELDS.map(({ key, label }) => (
                        <ColorField
                          key={key}
                          fieldKey="buttonBg"
                          label={label}
                          value={draft.colors[key]}
                          onChange={(value) => updateDraftColor(key, value)}
                        />
                      ))}
                    </s-stack>
                  </s-box>
                </s-stack>
              </s-box>

              <s-box padding="large" background="base" border="base" borderRadius="large">
                <s-stack direction="block" gap="large">
                  <s-stack direction="block" gap="small">
                    <s-text type="strong">Search defaults</s-text>
                    <s-paragraph tone="neutral" color="subdued">
                      Used when customers do not change duration or when the theme block
                      has no collection selected.
                    </s-paragraph>
                  </s-stack>

                  <s-grid gridTemplateColumns="1fr 1fr" gap="large">
                    <s-select
                      label="Default hire duration"
                      name="defaultDurationDays"
                      value={String(draft.defaultDurationDays)}
                      onChange={(event) =>
                        updateDraft(
                          "defaultDurationDays",
                          Number(event.currentTarget.value),
                        )
                      }
                    >
                      <option value="4">4 days</option>
                      <option value="8">8 days</option>
                    </s-select>
                    <s-text-field
                      label="Collection handle"
                      name="collectionHandle"
                      value={draft.collectionHandle}
                      onChange={(event) =>
                        updateDraft("collectionHandle", event.currentTarget.value)
                      }
                      details='e.g. "all" or your hire collection handle'
                    />
                  </s-grid>

                  <SearchColorHiddenFields colors={draft.colors} />

                  <s-stack direction="inline" gap="large" alignItems="center">
                    <s-button
                      type="submit"
                      variant="primary"
                      {...(isSaving ? { loading: true } : {})}
                    >
                      Save search settings
                    </s-button>
                    {isDirty ? (
                      <s-badge tone="warning">Unsaved changes</s-badge>
                    ) : (
                      <s-badge tone="success">All saved</s-badge>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            </s-stack>
          </Form>

          <SearchWidgetPreview config={draft} />
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
                Reset search to defaults
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
