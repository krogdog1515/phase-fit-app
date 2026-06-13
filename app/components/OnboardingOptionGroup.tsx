type OnboardingOptionGroupProps = {
  name: string;
  legend: string;
  hint?: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  columns?: 1 | 2;
};

export default function OnboardingOptionGroup({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  columns = 2,
}: OnboardingOptionGroupProps) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="pf-form-section-title mb-1">{legend}</legend>
      {hint ? <p className="pf-form-section-hint mb-3">{hint}</p> : null}
      <div
        className={
          columns === 1 ? "pf-radio-group pf-radio-group-single" : "pf-radio-group"
        }
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((option) => (
          <label key={option} className="pf-radio-option">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="pf-radio-input"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
