type ChangeLike = {
  currentTarget?: { value?: string; checked?: boolean } | null;
  target?: EventTarget | null;
  detail?: unknown;
};

/** Polaris web components may pass null, a raw string, or events without currentTarget. */
export function readFieldValue(event: unknown): string {
  if (event == null) {
    return "";
  }
  if (typeof event === "string") {
    return event;
  }
  if (typeof event !== "object") {
    return "";
  }

  const e = event as ChangeLike;
  if (typeof e.detail === "string") {
    return e.detail;
  }
  if (e.detail && typeof e.detail === "object" && "value" in e.detail) {
    const value = (e.detail as { value?: unknown }).value;
    return value == null ? "" : String(value);
  }

  return (
    e.currentTarget?.value ??
    (e.target as HTMLInputElement | null)?.value ??
    ""
  );
}

export function readCheckValue(event: unknown, fallback = false): boolean {
  if (event == null) {
    return fallback;
  }
  if (typeof event === "boolean") {
    return event;
  }
  if (typeof event !== "object") {
    return fallback;
  }

  const e = event as ChangeLike;
  if (typeof e.detail === "boolean") {
    return e.detail;
  }
  if (e.detail && typeof e.detail === "object" && "checked" in e.detail) {
    return Boolean((e.detail as { checked?: unknown }).checked);
  }

  return (
    e.currentTarget?.checked ??
    (e.target as HTMLInputElement | null)?.checked ??
    fallback
  );
}

export function readSelectValue(event: unknown): string {
  return readFieldValue(event);
}