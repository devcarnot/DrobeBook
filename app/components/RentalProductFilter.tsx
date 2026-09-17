import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";

import { pickRentalProductFromShopify } from "./RentalProductPicker";

export function RentalProductFilter({
  productId,
  productTitle,
  onSelect,
  onClear,
}: {
  productId: string;
  productTitle: string;
  onSelect: (productId: string) => void;
  onClear: () => void;
}) {
  const shopify = useAppBridge();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const displayValue = productTitle || "All products";

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function handleSelect() {
    const picked = await pickRentalProductFromShopify(shopify);
    if (!picked) {
      return;
    }

    onSelect(picked.productId);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="gk-filter-field">
      <label className="gk-filter-field__label" htmlFor="rental-product-filter">
        Products
      </label>
      <div className="gk-filter-field__control">
        <button
          id="rental-product-filter"
          type="button"
          className="gk-filter-field__trigger"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="gk-filter-field__value">{displayValue}</span>
          <span className="gk-filter-field__chevron" aria-hidden="true">
            ▾
          </span>
        </button>

        {open ? (
          <div className="gk-filter-field__popover" role="menu">
            <button type="button" className="gk-filter-field__action" onClick={handleSelect}>
              Select Products
            </button>
            {productId ? (
              <button
                type="button"
                className="gk-filter-field__clear"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
