/**
 * Pure decision for what the /generate page shows a pregnant user. Kept out of
 * the component so the fail-closed rule is testable in isolation: the form
 * renders ONLY when screening AND today's check-in are both positively clear.
 */

export type CheckinStatus = "loading" | "needed" | "blocked" | "clear";

export type PregnancyGenerateView =
  | "hard_stop"
  | "provider_conversation"
  | "needs_screening"
  | "checkin_needed"
  | "blocked"
  | "form";

export function resolvePregnancyGenerateView(input: {
  screening: string | null;
  checkinStatus: CheckinStatus;
}): PregnancyGenerateView {
  const { screening, checkinStatus } = input;

  if (screening === "hard_stop") return "hard_stop";
  if (screening === "provider_conversation") return "provider_conversation";
  if (screening !== "clear") return "needs_screening";

  // Screening is clear -> daily check-in gate. Fail closed: only a confirmed
  // 'clear' check-in renders the form. 'blocked' shows the neutral card;
  // anything else ('needed', still 'loading') points her back to check in.
  if (checkinStatus === "blocked") return "blocked";
  if (checkinStatus === "clear") return "form";
  return "checkin_needed";
}
