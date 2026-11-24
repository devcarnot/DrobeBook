import type { ClutchUpsellConfig } from "../lib/cart/clutch-upsell-config";

export function ClutchUpsellPreview({ config }: { config: ClutchUpsellConfig }) {
  const enabled = config.enabled && Boolean(config.collectionId || config.collectionHandle);

  return (
    <div style={{ minWidth: 0, maxWidth: "100%", width: "100%" }}>
      <s-box padding="large" background="base" border="base" borderRadius="large">
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="view" />
              <s-text type="strong">Checkout pop-up preview</s-text>
            </s-stack>
            <s-paragraph tone="neutral" color="subdued">
              Shown on the cart page when customers tap checkout with a gown hire line.
            </s-paragraph>
          </s-stack>

          <div className="gk-clutch-admin-preview">
            <div className="gk-clutch-admin-preview__backdrop" />
            <div
              className={`gk-clutch-admin-preview__panel${enabled ? "" : " gk-clutch-admin-preview__panel--disabled"}`}
              role="presentation"
            >
              <div className="gk-clutch-admin-preview__title">
                {config.modalTitle || "Add a clutch to your hire"}
              </div>
              <p className="gk-clutch-admin-preview__subtitle">
                {config.modalSubtitle ||
                  "Complete your look — discounted hire rates for these dates."}
              </p>
              <p className="gk-clutch-admin-preview__dates">
                <span className="gk-clutch-admin-preview__pill">Hire window</span>
                12 March 2026 → 15 March 2026
              </p>

              {enabled ? (
                <>
                  <div className="gk-clutch-admin-preview__card">
                    <div className="gk-clutch-admin-preview__thumb" />
                    <div className="gk-clutch-admin-preview__card-body">
                      <div className="gk-clutch-admin-preview__card-title">Sample clutch</div>
                      <div className="gk-clutch-admin-preview__card-meta">Size One Size</div>
                    </div>
                    <div className="gk-clutch-admin-preview__price">
                      {config.discountPercent > 0 ? (
                        <span className="gk-clutch-admin-preview__compare">$45.00</span>
                      ) : null}
                      <strong>
                        $
                        {config.discountPercent > 0
                          ? (45 * (1 - config.discountPercent / 100)).toFixed(2)
                          : "45.00"}
                      </strong>
                    </div>
                    <button type="button" className="gk-clutch-admin-preview__add">
                      {config.addToCartLabel || "Add to cart"}
                    </button>
                  </div>
                  <button type="button" className="gk-clutch-admin-preview__skip">
                    {config.skipButtonLabel || "Skip & checkout"}
                  </button>
                </>
              ) : (
                <s-banner tone="warning">
                  Turn on the pop-up and connect a clutch collection to preview the storefront
                  experience.
                </s-banner>
              )}
            </div>
          </div>
        </s-stack>
      </s-box>
    </div>
  );
}