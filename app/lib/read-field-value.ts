/** Polaris web components may emit change events without currentTarget. */
export function readFieldValue(event: {
  currentTarget: { value?: string } | null;
  target?: EventTarget | null;
}) {
  return (
    event.currentTarget?.value ??
    (event.target as HTMLInputElement | null)?.value ??
    ""
  );
}