import type { HireTerm } from "../lib/hire-terms";

type HireTermsEditorProps = {
  terms: HireTerm[];
  onChange: (terms: HireTerm[]) => void;
};

function nextTermId(terms: HireTerm[]): string {
  return `term-${terms.length + 1}`;
}

export function HireTermsEditor({ terms, onChange }: HireTermsEditorProps) {
  const updateLabel = (index: number, label: string) => {
    onChange(
      terms.map((term, termIndex) =>
        termIndex === index ? { ...term, label } : term,
      ),
    );
  };

  const addTerm = () => {
    onChange([
      ...terms,
      {
        id: nextTermId(terms),
        label: "",
      },
    ]);
  };

  const removeTerm = (index: number) => {
    if (terms.length <= 1) {
      return;
    }
    onChange(terms.filter((_, termIndex) => termIndex !== index));
  };

  return (
    <s-stack direction="block" gap="large">
      <s-paragraph tone="neutral" color="subdued">
        Customers must tick every checkbox before they can add a hire to cart.
      </s-paragraph>

      {terms.map((term, index) => (
        <s-box
          key={`${term.id}-${index}`}
          padding="base"
          background="subdued"
          borderRadius="base"
        >
          <s-stack direction="block" gap="small">
            <s-text-field
              label={`Checkbox ${index + 1}`}
              value={term.label}
              placeholder="I agree to the hire terms and conditions"
              onChange={(event) => updateLabel(index, event.currentTarget.value)}
            />
            {terms.length > 1 ? (
              <s-button
                type="button"
                variant="tertiary"
                tone="critical"
                onClick={() => removeTerm(index)}
              >
                Remove checkbox
              </s-button>
            ) : null}
          </s-stack>
        </s-box>
      ))}

      <s-button type="button" variant="secondary" onClick={addTerm}>
        Add another checkbox
      </s-button>
    </s-stack>
  );
}
