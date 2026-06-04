"use client";

import Image from "next/image";

const LOGO_WIDTH = 388;
const LOGO_HEIGHT = 210;

type PhaseFitLogoProps = {
  /** Header bar, auth screens, or home dashboard hero */
  variant?: "header" | "auth" | "dashboard";
  className?: string;
  priority?: boolean;
};

const VARIANT_HEIGHT = {
  header: 36,
  auth: 64,
  dashboard: 56,
} as const;

export default function PhaseFitLogo({
  variant = "header",
  className = "",
  priority = false,
}: PhaseFitLogoProps) {
  const height = VARIANT_HEIGHT[variant] ?? VARIANT_HEIGHT.header;
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
