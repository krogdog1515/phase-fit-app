import Image from "next/image";

const LOGO_WIDTH = 388;
const LOGO_HEIGHT = 210;

type PhaseFitLogoProps = {
  /** Header bar (home) vs centered auth screens */
  variant?: "header" | "auth";
  className?: string;
  priority?: boolean;
};

export default function PhaseFitLogo({
  variant = "header",
  className = "",
  priority = false,
}: PhaseFitLogoProps) {
  const height = variant === "auth" ? 64 : 36;
  const width = Math.round(height * (LOGO_WIDTH / LOGO_HEIGHT));

  return (
    <h1 className={className}>
      <Image
        src="/phasefit-logo.png"
        alt="Phase Fit"
        width={width}
        height={height}
        priority={priority}
        className="block"
        style={{ width, height: "auto" }}
      />
    </h1>
  );
}
