"use client";

import type { ReactNode } from "react";

/**
 * Shared Yes / No / Not sure question — the single tri-state input used by both
 * the pregnancy screening flow and the daily red-flag check-in. Two copies of a
 * safety-critical input would drift, so both call sites render this.
 *
 * 'unsure' is a first-class answer (see lib/safety/screening.ts and redFlags.ts):
 * it is always offered and downstream is treated identically to 'yes'.
 */
export type TriStateAnswer = "yes" | "no" | "unsure";

const ANSWER_OPTIONS: Array<{ value: TriStateAnswer; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

type TriStateQuestionProps = {
  /** Unique radio-group name for this question. */
  name: string;
  /** The question text (rendered as the fieldset legend). */
  legend: string;
  /** Optional plain-language helper below the question. */
  helper?: string;
  value: TriStateAnswer | undefined;
  onChange: (value: TriStateAnswer) => void;
  /** Extra content inside the fieldset (e.g. a conditional detail textarea). */
  children?: ReactNode;
};

export default function TriStateQuestion({
  name,
  legend,
  helper,
  value,
  onChange,
  children,
}: TriStateQuestionProps) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="pf-body-secondary text-sm mb-1">{legend}</legend>
      {helper ? <p className="pf-body-muted text-xs mb-2">{helper}</p> : null}
      <div className="pf-radio-group" role="radiogroup" aria-label={legend}>
        {ANSWER_OPTIONS.map((opt) => (
          <label key={opt.value} className="pf-radio-option">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="pf-radio-input"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {children}
    </fieldset>
  );
}
