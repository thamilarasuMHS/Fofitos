interface MHSLogoProps {
  size?: number;
  className?: string;
}

export function MHSLogo({ size = 48, className = '' }: MHSLogoProps) {
  const h = Math.round(size * 0.82);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 120 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="mhsGrad" x1="60" y1="0" x2="60" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5b21b6" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
      </defs>

      {/* Left wing — sweeps from center top outward to the left, curls inward at bottom */}
      <path
        d="M60 8
           C54 6 36 2 18 18
           C4 30 4 54 22 68
           C32 76 46 75 55 66
           C58 62 60 56 60 48
           Z"
        fill="url(#mhsGrad)"
      />
      {/* Left inner feather notch */}
      <path
        d="M60 48
           C58 55 52 63 47 70
           C42 77 36 82 38 88
           C40 93 52 91 57 84
           C59 80 60 74 60 66
           Z"
        fill="url(#mhsGrad)"
      />

      {/* Right wing — mirror of left */}
      <path
        d="M60 8
           C66 6 84 2 102 18
           C116 30 116 54 98 68
           C88 76 74 75 65 66
           C62 62 60 56 60 48
           Z"
        fill="url(#mhsGrad)"
      />
      {/* Right inner feather notch */}
      <path
        d="M60 48
           C62 55 68 63 73 70
           C78 77 84 82 82 88
           C80 93 68 91 63 84
           C61 80 60 74 60 66
           Z"
        fill="url(#mhsGrad)"
      />
    </svg>
  );
}
