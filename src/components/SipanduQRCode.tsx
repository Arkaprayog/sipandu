import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { publicAssetUrl } from '../lib/publicAssets';

interface SipanduQRCodeProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
  downloadFileName?: string;
}

const DOWNLOAD_RESOLUTION = 2400;
const KEMENSOS_BARCODE_LOGO_ASSET = publicAssetUrl('uploads/logo-kemsos.webp');

const loadLogoAsset = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Logo Kemensos pada barcode tidak dapat dimuat dari ${src}`));
    image.src = src;
  });

/** Load the exact logo file supplied in public/uploads; never synthesize or substitute branding. */
const loadKemensosBarcodeLogo = (): Promise<HTMLImageElement> => loadLogoAsset(KEMENSOS_BARCODE_LOGO_ASSET);

/**
 * Draw the exact uploaded Kemensos logo on a clean white quiet-zone panel.
 * The image keeps its original aspect ratio and is drawn at the target canvas
 * resolution, so it stays crisp in both the preview and exported PNG.
 */
const drawKemensosBarcodeLogo = (canvas: HTMLCanvasElement, logo: HTMLImageElement) => {
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

  // Do not silently export an unbranded QR: if both official assets fail, surface an error.
  const logo = await loadKemensosBarcodeLogo();
  drawKemensosBarcodeLogo(canvas, logo);

  return canvas;
};

export const SipanduQRCode: React.FC<SipanduQRCodeProps> = ({
  value,
  size = 220,
  label,
  className = '',
  downloadFileName = 'barcode-asesmen.png',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return () => { cancelled = true; };
    if (!value.trim()) {
      setPreviewError('URL Google Form responden belum diatur. Periksa Pengaturan Integrasi Google & WhatsApp.');
      return () => { cancelled = true; };
    }

    const render = async () => {
      setPreviewError('');
      try {
        // Triple CSS-size backing resolution keeps the displayed QR and centered Kemensos logo sharp.
        const rendered = await buildBrandedQrCanvas(value, Math.max(size * 3, 720));
        if (cancelled) return;

        displayCanvas.width = rendered.width;
        displayCanvas.height = rendered.height;
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(rendered, 0, 0);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('Gagal membuat barcode asesmen dengan logo Kemensos:', error);
          setPreviewError('Barcode belum dibuat karena logo Kemensos gagal dimuat. Periksa public/uploads/logo-kemsos.webp lalu muat ulang. ' + message);
        }
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
      // A dedicated 2400 x 2400 image keeps the QR modules and centered logo sharp when printed.
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
          aria-label={label || 'QR code dengan logo Kemensos'}
        />
      </div>
      {previewError && (
        <p role="alert" className="max-w-[260px] text-center text-[10px] leading-relaxed font-medium text-red-700">
          {previewError}
        </p>
      )}
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
        title="Unduh barcode PNG resolusi tinggi 2400 × 2400 piksel"
      >
        <Download className="h-4 w-4" />
        <span>{isDownloading ? 'Menyiapkan Barcode…' : 'Download Barcode'}</span>
      </button>
      <span className="text-[10px] text-neutral-500">PNG HD · 2400 × 2400 piksel</span>
      {downloadError && (
        <p role="alert" className="max-w-[240px] text-center text-[10px] font-medium text-red-700">
          {downloadError}
        </p>
      )}
    </div>
  );
};
