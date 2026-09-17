import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type {
  BulkImportSummary,
  CatalogPage,
  ShopifyCatalogProduct,
} from "../lib/rental-product/rental-product.types";

const MAX_SELECTION = 50;

type CatalogFilters = {
  vendors: string[];
  productTypes: string[];
};

type LoadCatalogResponse = {
  intent: "load-import-catalog";
  ok: boolean;
  catalog: CatalogPage;
  importedIds: string[];
  filters: CatalogFilters;
  errorMessage?: string | null;
};

type ImportResponse = {
  intent: "import-products";
  ok: boolean;
  message: string;
  summary: BulkImportSummary | null;
};

type ImportProductsModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResponse) => void;
};

function isLoadResponse(data: unknown): data is LoadCatalogResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      "intent" in data &&
      (data as LoadCatalogResponse).intent === "load-import-catalog",
  );
}

function isImportResponse(data: unknown): data is ImportResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      "intent" in data &&
      (data as ImportResponse).intent === "import-products",
  );
}

function ProductRow({
  product,
  selected,
  disabled,
  onToggle,
}: {
  product: ShopifyCatalogProduct;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`gk-import-product-row${disabled ? " gk-import-product-row--disabled" : ""}${
        selected ? " gk-import-product-row--selected" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`Select ${product.title}`}
      />
      {product.featuredImageUrl ? (
        <img src={product.featuredImageUrl} alt="" className="gk-import-product-row__image" />
      ) : (
        <div className="gk-import-product-row__image gk-import-product-row__image--empty" />
      )}
      <span className="gk-import-product-row__title">{product.title}</span>
      {disabled ? <span className="gk-import-product-row__badge">Imported</span> : null}
    </label>
  );
}

export function ImportProductsModal({ open, onClose, onImported }: ImportProductsModalProps) {
  const fetcher = useFetcher<LoadCatalogResponse | ImportResponse>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [products, setProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [pageInfo, setPageInfo] = useState<CatalogPage["pageInfo"]>({
    hasNextPage: false,
    endCursor: null,
  });
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<CatalogFilters>({ vendors: [], productTypes: [] });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const skipSearchEffectRef = useRef(true);
  const appendNextRef = useRef(false);
  const handledImportRef = useRef<ImportResponse | null>(null);

  const isLoading = fetcher.state !== "idle";
  const loadData = isLoadResponse(fetcher.data) ? fetcher.data : null;
  const importData = isImportResponse(fetcher.data) ? fetcher.data : null;

  function loadCatalog(input: {
    q?: string;
    status?: string;
    after?: string;
    append?: boolean;
  }) {
    appendNextRef.current = Boolean(input.append);
    const formData = new FormData();
    formData.set("intent", "load-import-catalog");
    formData.set("q", input.q ?? "");
    formData.set("status", input.status ?? "");
    if (input.after) {
      formData.set("after", input.after);
    }
    fetcher.submit(formData, { method: "post" });
  }

  useEffect(() => {
    if (!open) {
      skipSearchEffectRef.current = true;
      handledImportRef.current = null;
      return;
    }

    setSelected(new Set());
    setSearchInput("");
    setStatusFilter("");
    setProducts([]);
    setPageInfo({ hasNextPage: false, endCursor: null });
    setErrorMessage(null);
    loadCatalog({});
  }, [open]);

  useEffect(() => {
    if (!loadData) {
      return;
    }

    if (!loadData.ok) {
      setErrorMessage(loadData.errorMessage ?? "Could not load Shopify products.");
      return;
    }

    setErrorMessage(null);
    setImportedIds(new Set(loadData.importedIds));
    setFilters(loadData.filters);
    setPageInfo(loadData.catalog.pageInfo);
    setProducts((current) => {
      if (appendNextRef.current) {
        const seen = new Set(current.map((product) => product.shopifyProductId));
        const merged = [...current];
        for (const product of loadData.catalog.products) {
          if (!seen.has(product.shopifyProductId)) {
            merged.push(product);
          }
        }
        appendNextRef.current = false;
        return merged;
      }
      return loadData.catalog.products;
    });
  }, [loadData]);

  useEffect(() => {
    if (!importData || importData === handledImportRef.current) {
      return;
    }

    handledImportRef.current = importData;
    if (importData.ok) {
      onImported(importData);
    }
  }, [importData, onImported]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (skipSearchEffectRef.current) {
      skipSearchEffectRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      loadCatalog({ q: searchInput, status: statusFilter });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, statusFilter, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const eligibleCount = useMemo(
    () => products.filter((product) => !importedIds.has(product.shopifyProductId)).length,
    [products, importedIds],
  );

  function toggleProduct(productId: string) {
    if (importedIds.has(productId)) {
      return;
    }

    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else if (next.size < MAX_SELECTION) {
        next.add(productId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const product of products) {
      if (importedIds.has(product.shopifyProductId)) {
        continue;
      }
      if (next.size >= MAX_SELECTION) {
        break;
      }
      next.add(product.shopifyProductId);
    }
    setSelected(next);
  }

  function handleImport() {
    if (selected.size === 0) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", "import-products");
    formData.set("productIds", JSON.stringify([...selected]));
    fetcher.submit(formData, { method: "post" });
  }

  function loadMore() {
    if (!pageInfo.hasNextPage || !pageInfo.endCursor || isLoading) {
      return;
    }

    loadCatalog({
      q: searchInput,
      status: statusFilter,
      after: pageInfo.endCursor,
      append: true,
    });
  }

  if (!open) {
    return null;
  }

  return (
    <div className="gk-import-modal-root">
      <button
        type="button"
        className="gk-import-modal-backdrop"
        aria-label="Close import products"
        onClick={onClose}
      />
      <div
        className="gk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-products-title"
      >
        <div className="gk-import-modal__header">
          <h2 id="import-products-title" className="gk-import-modal__title">
            Select products
          </h2>
          <button type="button" className="gk-import-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="gk-import-modal__toolbar">
          <div className="gk-import-modal__search-wrap">
            <span className="gk-import-modal__search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              className="gk-import-modal__search"
              placeholder="Search products"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
            />
          </div>
          <select
            className="gk-import-modal__filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value)}
            aria-label="Filter by Shopify status"
          >
            <option value="">Search by all</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <div className="gk-import-modal__meta">
          <button
            type="button"
            className="gk-import-modal__link-btn"
            onClick={selectAllVisible}
            disabled={eligibleCount === 0 || isLoading}
          >
            Select all on this page
          </button>
          {filters.vendors.length || filters.productTypes.length ? (
            <span className="gk-import-modal__hint">
              {filters.vendors.length} vendors · {filters.productTypes.length} product types in store
            </span>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="gk-import-modal__error">{errorMessage}</div>
        ) : null}

        {importData && !importData.ok ? (
          <div className="gk-import-modal__error">{importData.message}</div>
        ) : null}

        <div className="gk-import-modal__list">
          {isLoading && products.length === 0 ? (
            <div className="gk-import-modal__empty">Loading Shopify products…</div>
          ) : null}

          {!isLoading && products.length === 0 ? (
            <div className="gk-import-modal__empty">No Shopify products found.</div>
          ) : null}

          {products.map((product) => {
            const alreadyImported = importedIds.has(product.shopifyProductId);
            const checked = alreadyImported || selected.has(product.shopifyProductId);

            return (
              <ProductRow
                key={product.shopifyProductId}
                product={product}
                selected={checked}
                disabled={alreadyImported}
                onToggle={() => toggleProduct(product.shopifyProductId)}
              />
            );
          })}

          {pageInfo.hasNextPage ? (
            <div className="gk-import-modal__load-more">
              <button type="button" className="gk-import-modal__link-btn" onClick={loadMore} disabled={isLoading}>
                {isLoading ? "Loading…" : "Load more products"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="gk-import-modal__footer">
          <span className="gk-import-modal__count">
            {selected.size}/{MAX_SELECTION} products selected
          </span>
          <div className="gk-import-modal__actions">
            <button type="button" className="gk-import-modal__cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="gk-import-modal__select"
              disabled={selected.size === 0 || isLoading}
              onClick={handleImport}
            >
              {isLoading && selected.size > 0 ? "Importing…" : "Select"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
