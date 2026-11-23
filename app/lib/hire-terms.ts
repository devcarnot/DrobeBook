export type HireTerm = {
  id: string;
  label: string;
};

export const DEFAULT_HIRE_TERMS: HireTerm[] = [
  {
    id: "agree-terms",
    label: "I agree to the GK.Drobe hire terms and conditions",
  },
  {
    id: "garment-care",
    label:
      "I understand I am responsible for the care of the garment during the hire period",
  },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeHireTerms(value: unknown): HireTerm[] {
  if (!Array.isArray(value)) {
    return DEFAULT_HIRE_TERMS.map((entry) => ({ ...entry }));
  }

  if (value.length === 0) {
    return [];
  }

  const terms = value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Partial<HireTerm>;
      const label = String(record.label ?? "").trim();
      if (!label) {
        return null;
      }

      const id = String(record.id ?? "").trim() || slugify(label) || `term-${index + 1}`;
      return { id, label };
    })
    .filter((entry): entry is HireTerm => entry != null);

  return terms;
}

export function hireTermsFromFormData(formData: FormData): HireTerm[] {
  const raw = String(formData.get("hireTermsJson") ?? "").trim();
  if (!raw) {
    return DEFAULT_HIRE_TERMS.map((entry) => ({ ...entry }));
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0) {
      return [];
    }
    return normalizeHireTerms(parsed);
  } catch {
    return DEFAULT_HIRE_TERMS.map((entry) => ({ ...entry }));
  }
}
