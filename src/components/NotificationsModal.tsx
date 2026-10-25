import React from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  // Do not show fabricated respondent/medical notifications. This list will be
  // populated when a real notification source is connected.
  const notifications: Array<{
    id: string | number;
    title: string;
    desc: string;
    time: string;
    unread: boolean;
  }> = [];

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
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {notifications.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-neutral-500" />
              <p className="text-sm font-semibold text-neutral-200">Belum ada notifikasi</p>
              <p className="mt-1 text-xs text-neutral-400">Notifikasi akan muncul setelah sumber notifikasi nyata terhubung.</p>
            </div>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-3.5 rounded-xl border text-xs transition ${
                n.unread
                  ? 'bg-[#152e19] border-rose-500/50 shadow-sm'
                  : 'bg-black/50 border-emerald-950 text-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-xs">{n.title}</span>
                {n.unread && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-600 text-white font-bold">
                    Baru
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-300 leading-snug">{n.desc}</p>
              <span className="text-[10px] text-sky-300/80 mt-2 block font-mono">
                {n.time}
              </span>
            </div>
          ))}
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
