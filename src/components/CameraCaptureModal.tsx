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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      setCapturedImage(null);
      setCameraError('');
      return;
    }

    const startCamera = async () => {
      try {
        setCameraError('');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        console.warn('Camera access error:', err);
        setCameraError(
          'Tidak dapat mengakses kamera fisik (kamera sibuk atau izin diblokir). Anda dapat menggunakan fitur Unggah File atau Simulasi Jepret Foto.'
        );
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen]);

  const handleTakeSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) {
      // Fallback simulated snapshot if video stream not active
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1c3621';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, 320, 220);
        ctx.font = '14px sans-serif';
        ctx.fillText(`Live Captured: ${new Date().toLocaleTimeString()} WIB`, 320, 260);
        setCapturedImage(canvas.toDataURL('image/jpeg'));
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
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
