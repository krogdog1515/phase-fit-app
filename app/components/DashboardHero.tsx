import PhaseFitLogo from "./PhaseFitLogo";

type DashboardHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  ariaLabel?: string;
};

export default function DashboardHero({
  eyebrow,
  title,
  description,
  ariaLabel,
}: DashboardHeroProps) {
  return (
    <section
      className="pf-home-hero px-5 pt-2 pb-8 sm:pb-10 text-center"
      aria-label={ariaLabel ?? eyebrow}
    >
      <PhaseFitLogo
        variant="dashboard"
        className="flex justify-center mb-5 sm:mb-6"
        priority
      />
      <p className="pf-section-eyebrow mb-2">{eyebrow}</p>
      <h2 className="pf-heading-hero max-w-md mx-auto leading-snug">{title}</h2>
      <p className="mt-3 pf-body-secondary max-w-sm mx-auto text-[0.9375rem] leading-relaxed">
        {description}
      </p>
    </section>
  );
}
