import React from 'react';
import { publicAssetUrl } from '../lib/publicAssets';

interface KemensosLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'mini';
  showText?: boolean;
}

/**
 * Official institutional mark used only in official document letterheads.
 * The uploaded Kemensos asset is rendered as-is; this component does not draw
 * or synthesize a replacement emblem.
 */
export const KemensosLogo: React.FC<KemensosLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const dimensions = {
    mini: 26,
    sm: 34,
    md: 48,
    lg: 64,
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <img
        src={publicAssetUrl('uploads/Logo Kemensos.png')}
        alt="Lambang resmi Kementerian Sosial Republik Indonesia"
        width={dimensions}
        height={dimensions}
        loading="eager"
        decoding="async"
        className="shrink-0 object-contain"
      />
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
