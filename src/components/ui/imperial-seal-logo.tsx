"use client";

import { UmeBlossomLayers, UmePetalGradientDefs } from "@/design/ume-blossom";

type ImperialSealLogoProps = {
  stamped?: boolean;
  compact?: boolean;
  className?: string;
};

export function ImperialSealLogo({
  stamped = false,
  compact = false,
  className = "",
}: ImperialSealLogoProps) {
  if (compact) {
    return <ImperialSealMark stamped={stamped} size="sm" className={className} />;
  }

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <ImperialSealMark stamped={stamped} size="md" />
      <span className="brand-wordmark truncate text-xl leading-none text-brand-gold">Kampaku</span>
    </div>
  );
}

type ImperialSealMarkProps = {
  stamped?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_PX = { sm: 32, md: 48, lg: 72 } as const;

export function ImperialSealMark({
  stamped = false,
  size = "md",
  className = "",
}: ImperialSealMarkProps) {
  const px = SIZE_PX[size];
  const filterId = `stamp-${size}-${stamped ? "y" : "n"}`;
  const stroke = size === "sm" ? 0.75 : 0.6;

  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      className={`shrink-0 overflow-visible text-[var(--brand)] ${className}`}
      role="img"
      aria-label="Kampaku"
    >
      <defs>
        <StampFilter id={filterId} />
        <UmePetalGradientDefs />
      </defs>

      <g filter={stamped ? `url(#${filterId})` : undefined}>
        <SealFrame stamped={stamped} />
        <UmeBlossomLayers strokeWidth={stroke} opacity={stamped ? 0.9 : 1} />
      </g>
    </svg>
  );
}

function SealFrame({ stamped }: { stamped: boolean }) {
  return (
    <>
      <rect
        x="3"
        y="3"
        width="94"
        height="94"
        fill="none"
        stroke="var(--brand-gold, currentColor)"
        strokeWidth="3"
        opacity={stamped ? 0.92 : 1}
      />
      <rect
        x="8"
        y="8"
        width="84"
        height="84"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity={stamped ? 0.82 : 1}
      />
      <ImperialCornerMarks />
    </>
  );
}

function ImperialCornerMarks() {
  const s = 4;
  const inset = 11;
  const corners: Array<[number, number, number, number]> = [
    [inset, inset, inset + s, inset],
    [inset, inset, inset, inset + s],
    [100 - inset, inset, 100 - inset - s, inset],
    [100 - inset, inset, 100 - inset, inset + s],
    [inset, 100 - inset, inset + s, 100 - inset],
    [inset, 100 - inset, inset, 100 - inset - s],
    [100 - inset, 100 - inset, 100 - inset - s, 100 - inset],
    [100 - inset, 100 - inset, 100 - inset, 100 - inset - s],
  ];
  return (
    <g stroke="var(--brand-gold, transparent)" strokeWidth="0.85" strokeLinecap="square">
      {corners.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </g>
  );
}

function StampFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.06"
        numOctaves="3"
        seed="8"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="0.65"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
}
