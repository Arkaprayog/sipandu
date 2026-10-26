import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  title: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    let effectStream: MediaStream | null = null;

    const stopStream = (mediaStream: MediaStream | null) => {
      if (!mediaStream) return;
      mediaStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* track may already be stopped */ }
      });
      if (videoRef.current?.srcObject === mediaStream) videoRef.current.srcObject = null;
      if (streamRef.current === mediaStream) streamRef.current = null;
    };

    if (!isOpen) {
      stopStream(streamRef.current);
      setCapturedImage(null);
      setCameraError('');
      return;
    }

    const startCamera = async () => {
      try {
        setCameraError('');
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser tidak mendukung akses kamera melalui getUserMedia.');
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        // The modal may close while the browser is waiting for camera permission.
        if (cancelled) {
          stopStream(mediaStream);
          return;
        }

        effectStream = mediaStream;
        streamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          try { await videoRef.current.play(); } catch { /* autoplay policy may delay playback */ }
        } else {
          stopStream(mediaStream);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('Camera access error:', err);
        setCameraError(
          'Kamera tidak dapat diakses (izin diblokir, kamera sibuk, atau browser tidak mendukung). Gunakan fitur Unggah Berkas. SIPANDU tidak membuat foto simulasi.'
        );
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopStream(effectStream);
    };
  }, [isOpen]);

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) {
      setCameraError('Kamera belum siap. Izinkan akses kamera atau gunakan Unggah Berkas; foto simulasi tidak akan disimpan sebagai foto responden.');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCameraError('Kamera belum menghasilkan gambar. Tunggu hingga pratinjau kamera tampil, lalu coba lagi atau gunakan Unggah Berkas.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(dataUrl);
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-none">
      <div className="relative w-full max-w-lg bg-[#0e1b10] border border-rose-500/50 rounded-2xl shadow-2xl p-5 flex flex-col items-center select-none text-white">
        <div className="w-full flex items-center justify-between pb-3 border-b border-rose-500/30 mb-4">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-300" />
            <h3 className="text-sm font-bold text-white">{title} (Kamera Live)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {cameraError && (
          <div className="w-full mb-3 p-3 rounded-lg bg-amber-950/60 border border-amber-500/40 text-xs text-amber-200">
            {cameraError}
          </div>
        )}

        {/* Video / Snapshot Surface */}
        <div className="relative w-full aspect-4/3 rounded-xl overflow-hidden bg-black border border-emerald-500/30 flex items-center justify-center">
          {!capturedImage ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={capturedImage}
              alt="Hasil Tangkapan"
              className="w-full h-full object-cover"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Control Buttons */}
        <div className="w-full mt-4 flex items-center justify-between gap-3">
          {!capturedImage ? (
            <button
              type="button"
              onClick={handleTakeSnapshot}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-xs uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Ambil Foto Sekarang</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-2.5 rounded-xl bg-black/60 hover:bg-black/80 border border-rose-500/40 text-neutral-200 font-medium text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Foto Ulang</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Gunakan Foto Ini</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
