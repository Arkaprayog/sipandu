import React from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
}

/**
 * Do not seed this panel with fictitious respondent/medical notifications.
 * Real notifications should be supplied by the event/notification service.
 */
export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-md bg-[#0e1d11] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white select-none">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-sky-300" />
            <h3 className="text-base font-bold text-white">Notifikasi Terpadu SIPANDU</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white"
            aria-label="Tutup notifikasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
          <Bell className="mx-auto mb-3 h-8 w-8 text-neutral-500" />
          <p className="text-sm font-semibold text-neutral-200">Belum ada notifikasi aktual</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Nama responden, hasil asesmen, jadwal ARV, dan status baru hanya akan ditampilkan setelah terhubung ke sumber notifikasi yang nyata.
          </p>
        </div>
        <div className="mt-5 pt-3 border-t border-rose-500/20 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-black/60 hover:bg-black/80 border border-rose-500/30 text-xs font-semibold text-neutral-200"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
