import React from 'react';

interface KemensosLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'mini';
  showText?: boolean;
}

export const KemensosLogo: React.FC<KemensosLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  // Dimensions
  const dimensions = {
    mini: { width: 32, height: 32, iconSize: 22 },
    sm: { width: 140, height: 42, iconSize: 34 },
    md: { width: 220, height: 56, iconSize: 48 },
    lg: { width: 300, height: 76, iconSize: 64 },
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Emblem SVG */}
      <svg
        width={dimensions.iconSize}
        height={dimensions.iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_2px_8px_rgba(239,68,68,0.35)]"
      >
        {/* Background shield/circle in deep crimson/gold */}
        <circle cx="50" cy="50" r="48" fill="#991B1B" stroke="#F59E0B" strokeWidth="2.5" />
        <circle cx="50" cy="50" r="43" fill="#1C1917" stroke="#FEF08A" strokeWidth="1" />

        {/* Golden Sunburst / Flower petals */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <path
            key={i}
            d="M 50 14 L 54 26 L 46 26 Z"
            fill="#FBBF24"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}

        {/* Supporting Hands / Caring Wings in Gold & White */}
        <path
          d="M 24 64 C 28 44 42 38 50 48 C 58 38 72 44 76 64 C 68 76 32 76 24 64 Z"
          fill="#F59E0B"
        />
        <path
          d="M 28 66 C 34 52 44 46 50 54 C 56 46 66 52 72 66 C 64 74 36 74 28 66 Z"
          fill="#FEF3C7"
        />

        {/* Central Heart of Social Protection */}
        <path
          d="M 50 56 C 47 50 40 50 38 55 C 36 60 50 70 50 70 C 50 70 64 60 62 55 C 60 50 53 50 50 56 Z"
          fill="#DC2626"
        />

        {/* Golden Star at top */}
        <polygon
          points="50,22 52,27 57,27 53,30 55,35 50,32 45,35 47,30 43,27 48,27"
          fill="#FDE047"
        />
      </svg>

      {/* Typography */}
      {showText && size !== 'mini' && (
        <div className="flex flex-col text-left leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-wider text-white text-base md:text-lg">
              KEMENSOS
            </span>
            <span className="bg-rose-600 text-white font-black text-[10px] md:text-xs px-1.5 py-0.5 rounded tracking-widest uppercase shadow-sm">
              HADIR
            </span>
          </div>
          <span className="text-[10px] md:text-xs font-medium text-emerald-200/90 tracking-wide">
            Kementerian Sosial Republik Indonesia
          </span>
        </div>
      )}
    </div>
  );
};
