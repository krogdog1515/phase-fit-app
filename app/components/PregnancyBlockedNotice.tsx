/**
 * The neutral copy shown when today's daily check-in is blocked. Single-sourced
 * so the home screen and the /generate page render exactly the same words. No
 * diagnosis, no speculation, no listing which flag fired.
 */
export default function PregnancyBlockedNotice() {
  return (
    <p className="text-pf-text-secondary text-[0.9375rem] leading-relaxed">
      Some of what you&apos;ve flagged is worth a call to your provider today.
      We&apos;re not going to suggest training. Rest, hydrate, and reach out.
    </p>
  );
}
