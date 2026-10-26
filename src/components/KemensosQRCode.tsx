import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

interface KemensosQRCodeProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
  downloadFileName?: string;
}

const DOWNLOAD_RESOLUTION = 1600;
const LOGO_ASSET = `${import.meta.env.BASE_URL}uploads/Logo%20Kemensos.png`;

const loadKemensosLogo = (): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Logo Kemensos dari public/uploads tidak dapat dimuat.'));
    image.src = LOGO_ASSET;
  });

/**
 * Draw the actual uploaded Kemensos logo on a clean white quiet-zone panel.
 * The image keeps its original aspect ratio and is drawn at the target canvas
 * resolution, so it stays crisp in both the preview and exported PNG.
 */
const drawKemensosLogo = (canvas: HTMLCanvasElement, logo: HTMLImageElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx || !logo.naturalWidth || !logo.naturalHeight) return;

  const canvasSize = canvas.width;
  const center = canvasSize / 2;
  const maxLogoWidth = canvasSize * 0.22;
  const maxLogoHeight = canvasSize * 0.22;
  const scale = Math.min(
    maxLogoWidth / logo.naturalWidth,
    maxLogoHeight / logo.naturalHeight,
  );
  const logoWidth = logo.naturalWidth * scale;
  const logoHeight = logo.naturalHeight * scale;
  const padding = canvasSize * 0.012;
  const panelWidth = logoWidth + padding * 2;
  const panelHeight = logoHeight + padding * 2;
  const panelX = center - panelWidth / 2;
  const panelY = center - panelHeight / 2;
  const radius = Math.min(canvasSize * 0.012, panelWidth / 5, panelHeight / 5);

  // The opaque panel protects the QR's scan area while avoiding an oversized badge.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(panelX + radius, panelY);
  ctx.lineTo(panelX + panelWidth - radius, panelY);
  ctx.quadraticCurveTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + radius);
  ctx.lineTo(panelX + panelWidth, panelY + panelHeight - radius);
  ctx.quadraticCurveTo(
    panelX + panelWidth, panelY + panelHeight,
    panelX + panelWidth - radius, panelY + panelHeight,
  );
  ctx.lineTo(panelX + radius, panelY + panelHeight);
  ctx.quadraticCurveTo(panelX, panelY + panelHeight, panelX, panelY + panelHeight - radius);
  ctx.lineTo(panelX, panelY + radius);
  ctx.quadraticCurveTo(panelX, panelY, panelX + radius, panelY);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, canvasSize * 0.002);
  ctx.strokeStyle = '#d1d5db';
  ctx.stroke();

  // Preserve the official uploaded image's proportions; never redraw it as text.
  ctx.drawImage(
    logo,
    center - logoWidth / 2,
    center - logoHeight / 2,
    logoWidth,
    logoHeight,
  );
  ctx.restore();
};

const buildBrandedQrCanvas = async (
  value: string,
  resolution: number,
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas');

  await QRCode.toCanvas(canvas, value, {
    width: resolution,
    margin: 4,
    color: {
      dark: '#0f1710',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'H',
  });

  try {
    const logo = await loadKemensosLogo();
    drawKemensosLogo(canvas, logo);
  } catch (error) {
    // Keep a valid QR available even if the logo asset is unavailable for a moment.
    console.error('Logo Kemensos tidak berhasil dimuat; QR dibuat tanpa logo.', error);
  }

  return canvas;
};

export const KemensosQRCode: React.FC<KemensosQRCodeProps> = ({
  value,
  size = 220,
  label,
  className = '',
  downloadFileName = 'barcode-asesmen.png',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const displayCanvas = canvasRef.current;
    if (!displayCanvas || !value) return () => { cancelled = true; };

    const render = async () => {
      try {
        // Render at 2x backing resolution for sharper display on high-density screens.
        const rendered = await buildBrandedQrCanvas(value, Math.max(size * 2, 440));
        if (cancelled) return;

        displayCanvas.width = rendered.width;
        displayCanvas.height = rendered.height;
        const ctx = displayCanvas.getContext('2d');
        if (ctx) ctx.drawImage(rendered, 0, 0);
      } catch (error) {
        if (!cancelled) console.error('Gagal membuat barcode asesmen:', error);
      }
    };

    void render();
    return () => { cancelled = true; };
  }, [value, size]);

  const handleDownload = useCallback(async () => {
    if (!value || isDownloading) return;
    setIsDownloading(true);
    setDownloadError('');

    try {
      // A dedicated 1600 x 1600 image keeps the downloaded barcode crisp when printed.
      const canvas = await buildBrandedQrCanvas(value, DOWNLOAD_RESOLUTION);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error('Browser tidak dapat menyiapkan file PNG.'));
        }, 'image/png');
      });

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadFileName.toLowerCase().endsWith('.png')
        ? downloadFileName
        : `${downloadFileName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (error) {
      console.error('Gagal mengunduh barcode:', error);
      setDownloadError('Barcode belum berhasil diunduh. Silakan coba kembali.');
    } finally {
      setIsDownloading(false);
    }
  }, [downloadFileName, isDownloading, value]);

  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-neutral-200 ${className}`}>
      <div className="relative rounded-lg border border-neutral-200 bg-white p-1">
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="block rounded"
          role="img"
          aria-label={label || 'QR code dengan logo Kementerian Sosial RI'}
        />
      </div>
      {label && (
        <span className="max-w-[260px] text-center text-xs font-semibold leading-snug tracking-wide text-neutral-800">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={handleDownload}
        disabled={!value || isDownloading}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-400 bg-white px-3 py-2 text-xs font-bold text-black transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        title="Unduh barcode PNG resolusi tinggi 1600 × 1600 piksel"
      >
        <Download className="h-4 w-4" />
        <span>{isDownloading ? 'Menyiapkan Barcode…' : 'Download Barcode'}</span>
      </button>
      <span className="text-[10px] text-neutral-500">PNG HD · 1600 × 1600 piksel</span>
      {downloadError && (
        <p role="alert" className="max-w-[240px] text-center text-[10px] font-medium text-red-700">
          {downloadError}
        </p>
      )}
    </div>
  );
};
