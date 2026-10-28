import React from 'react';
import { publicAssetUrl } from '../lib/publicAssets';

interface SipanduLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'mini';
  showText?: boolean;
}

/** Always render the logo uploaded by the project owner; never draw or synthesize a substitute. */
export const SipanduLogo: React.FC<SipanduLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
}) => {
  const dimensions = {
    mini: 28,
    sm: 40,
    md: 52,
    lg: 68,
  }[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <img
        src={publicAssetUrl('uploads/sipandu-logo.png')}
        alt="Logo resmi SIPANDU ODHIV"
        width={dimensions}
        height={dimensions}
        loading="eager"
        decoding="async"
        className="shrink-0 object-contain"
      />
      {showText && size !== 'mini' && (
        <div className="flex flex-col text-left leading-tight">
          <span className="font-extrabold tracking-wide text-white text-base md:text-lg">
            SIPANDU ODHIV
          </span>
          <span className="text-[10px] md:text-xs font-medium text-emerald-200/90 tracking-wide">
            Sistem Informasi &amp; Pendampingan Terpadu
          </span>
        </div>
      )}
    </div>
  );
};
