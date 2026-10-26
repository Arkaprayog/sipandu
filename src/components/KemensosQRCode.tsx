import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface KemensosQRCodeProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}

/**
 * QR code shared by all assessment links.
 * The center mark is the real Kemensos image shipped in public/uploads,
 * not a text or AI-generated approximation.
 */
export const KemensosQRCode: React.FC<KemensosQRCodeProps> = ({
  value,
  size = 220,
  label,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    if (!canvas) return () => { cancelled = true; };
    if (!value) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return () => { cancelled = true; };
    }

    const renderQrWithKemensosLogo = async () => {
      try {
        await QRCode.toCanvas(canvas, value, {
          width: size,
          margin: 2,
          color: {
            dark: '#0f1710',
            light: '#ffffff',
          },
          // High error correction allows a center logo while keeping the QR scannable.
          errorCorrectionLevel: 'H',
        });

        if (cancelled) return;

        const logo = new Image();
        logo.onload = () => {
          if (cancelled) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const center = size / 2;
          const badgeRadius = size * 0.17;
          const maxLogoSide = size * 0.235;

          // White circular quiet area behind the official logo, with a subtle border.
          ctx.save();
          ctx.beginPath();
          ctx.arc(center, center, badgeRadius + 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, size * 0.009);
          ctx.strokeStyle = '#d1d5db';
          ctx.stroke();

          // Fit the supplied logo into the center without stretching its proportions.
          const ratio = Math.min(
            maxLogoSide / logo.naturalWidth,
            maxLogoSide / logo.naturalHeight,
          );
          const logoWidth = logo.naturalWidth * ratio;
          const logoHeight = logo.naturalHeight * ratio;
          ctx.drawImage(
            logo,
            center - logoWidth / 2,
            center - logoHeight / 2,
            logoWidth,
            logoHeight,
          );
          ctx.restore();
        };
        logo.onerror = () => {
          // Leave the QR itself intact and scannable if the uploaded logo cannot load.
          console.error('Logo Kemensos dari public/uploads gagal dimuat.');
        };
        logo.src = `${import.meta.env.BASE_URL}uploads/Logo%20Kemensos.png`;
      } catch (error) {
        if (!cancelled) console.error('Gagal membuat QR code asesmen:', error);
      }
    };

    void renderQrWithKemensosLogo();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className={`flex flex-col items-center gap-2 p-3 bg-white rounded-xl shadow-lg ${className}`}>
      <div className="relative p-1 bg-white rounded-lg border border-neutral-200">
        <canvas
          ref={canvasRef}
          className="block rounded"
          role="img"
          aria-label={label || 'QR code dengan logo Kementerian Sosial RI'}
        />
      </div>
      {label && (
        <span className="text-xs font-semibold text-neutral-800 text-center tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
};
