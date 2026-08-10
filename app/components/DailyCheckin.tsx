"use client";

import { useState } from "react";
import supabase from "../lib/supabase";
import TriStateQuestion, { type TriStateAnswer } from "./TriStateQuestion";
import { localDateISO } from "@/lib/dates";
import type { RedFlagKey } from "@/lib/safety/redFlags";

/**
 * Daily red-flag check-in shown on the home screen before we plan a session.
 *
 * The verdict (blocked or not) is computed SERVER-SIDE by the check-in route via
 * evaluateRedFlags; this component only collects answers and reports back the
 * server's verdict. It never decides safety.
 *
 * The qualifiers on the dizziness and breathlessness questions are LOAD-BEARING.
 * Momentary dizziness on standing is near-universal in pregnancy; a gate that
 * hard-stops her on normal experience gets read as punitive, gets answered
 * dishonestly, and then protects nothing. The CSEP stop-sign list carries these
 * qualifiers for exactly this reason. Do not drop them.
 */
const RED_FLAG_QUESTIONS: Array<{ key: RedFlagKey; text: string }> = [
  { key: "bleeding", text: "Any bleeding?" },
  { key: "fluidLeak", text: "Any fluid leaking that isn't urine?" },
  { key: "contractions", text: "Regular, painful tightening or cramping?" },
  { key: "chestPain", text: "Any chest pain?" },
  {
    key: "dizziness",
    text: "Dizzy or faint in a way that didn't go away when you rested?",
  },
  {
    key: "breathlessness",
    text: "Short of breath in a way that didn't go away when you rested?",
  },
];

type Answers = Record<RedFlagKey, TriStateAnswer | undefined>;

const EMPTY_ANSWERS: Answers = {
  bleeding: undefined,
  fluidLeak: undefined,
  contractions: undefined,
  chestPain: undefined,
  dizziness: undefined,
  breathlessness: undefined,
};

/** A 1–5 scale rendered as a radio group. */
function ScaleField({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="pf-body-secondary text-sm mb-2">{legend}</legend>
      <div className="pf-radio-group" role="radiogroup" aria-label={legend}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="pf-radio-option">
            <input
              type="radio"
              name={legend}
              checked={value === n}
              onChange={() => onChange(n)}
              className="pf-radio-input"
            />
            <span>{n}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function DailyCheckin({
  onComplete,
}: {
  /** Called with the server-computed verdict after a successful submit. */
  onComplete: (blocked: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = RED_FLAG_QUESTIONS.every(
    (q) => answers[q.key] !== undefined,
  );

  const submit = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pregnancy/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // No verdict is sent — the server computes it.
        body: JSON.stringify({
          date: localDateISO(new Date()),
          answers,
          energy,
          sleepQuality: sleep,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not save. Please try again.");
        setSubmitting(false);
        return;
      }
      onComplete(Boolean(data?.blocked));
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-pf-text-secondary text-[0.9375rem] leading-relaxed">
        Quick check before we plan today.
      </p>

      <div className="space-y-5">
        {RED_FLAG_QUESTIONS.map((q) => (
          <TriStateQuestion
            key={q.key}
            name={`checkin-${q.key}`}
            legend={q.text}
            value={answers[q.key]}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [q.key]: v }))}
          />
        ))}
      </div>

      <ScaleField legend="How's your energy?" value={energy} onChange={setEnergy} />
      <ScaleField legend="How did you sleep?" value={sleep} onChange={setSleep} />

      <div>
        <label className="pf-label">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything you'd want noted"
          rows={2}
          className="pf-textarea"
        />
      </div>

      {error ? <p className="text-sm text-pf-coral">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !allAnswered}
        className="pf-btn-primary disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Submit check-in"}
      </button>
    </div>
  );
}
