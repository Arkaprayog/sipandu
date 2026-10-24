import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface KemensosQRCodeProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}

export const KemensosQRCode: React.FC<KemensosQRCodeProps> = ({
  value,
  size = 220,
  label,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    // Generate QR with high error correction so center logo does not break scan
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: '#0f1710',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // High error correction (30% recovery)
      },
      (error) => {
        if (error) {
          console.error('Error generating QR code', error);
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw center logo circle badge
        const center = size / 2;
        const badgeRadius = size * 0.17;

        // White border circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, badgeRadius + 3, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ef4444';
        ctx.stroke();

        // Crimson background circle
        ctx.beginPath();
        ctx.arc(center, center, badgeRadius, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#991b1b';
        ctx.fill();

        // Golden center emblem
        ctx.beginPath();
        ctx.arc(center, center, badgeRadius * 0.72, 0, 2 * Math.PI, false);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();

        // Text or center heart
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(size * 0.075)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KEMENSOS', center, center - 2);

        ctx.font = `bold ${Math.round(size * 0.05)}px sans-serif`;
        ctx.fillStyle = '#fef08a';
        ctx.fillText('HADIR', center, center + Math.round(size * 0.07));
        ctx.restore();
      }
    );
  }, [value, size]);

  return (
    <div className={`flex flex-col items-center gap-2 p-3 bg-white rounded-xl shadow-lg ${className}`}>
      <div className="relative p-1 bg-white rounded-lg border border-neutral-200">
        <canvas ref={canvasRef} className="block rounded" />
      </div>
      {label && (
        <span className="text-xs font-semibold text-neutral-800 text-center tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
};
