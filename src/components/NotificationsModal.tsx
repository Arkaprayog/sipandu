import React from 'react';
import { Bell, X, CheckCheck, BellRing, Volume2, Vibrate, Smartphone } from 'lucide-react';
import type { RespondentNotification } from '../lib/respondentNotifications';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: RespondentNotification[];
  permission: NotificationPermission | 'unsupported';
  onEnableNotifications: () => Promise<NotificationPermission | 'unsupported'>;
  onMarkAllRead: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  permission,
  onEnableNotifications,
  onMarkAllRead,
}) => {
  const [permissionBusy, setPermissionBusy] = React.useState(false);
  const [permissionMessage, setPermissionMessage] = React.useState('');

  if (!isOpen) return null;

  const enable = async () => {
    setPermissionBusy(true);
    setPermissionMessage('');
    try {
      const result = await onEnableNotifications();
      setPermissionMessage(
        result === 'granted'
          ? 'Izin notifikasi diberikan. Bunyi, getar, banner, dan tampilan layar kunci mengikuti izin notifikasi SIPANDU di pengaturan Android/Chrome.'
          : result === 'denied'
            ? 'Izin ditolak. Aktifkan notifikasi SIPANDU melalui Pengaturan Android → Aplikasi → Chrome/SIPANDU → Notifikasi.'
            : 'Browser ini belum mendukung notifikasi sistem atau service worker. Buka SIPANDU di Chrome dan izinkan notifikasi.'
      );
    } catch (error) {
      setPermissionMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPermissionBusy(false);
    }
  };

  const unreadCount = notifications.filter((item) => !item.read).length;
  const permissionLabel = permission === 'granted'
    ? 'Izin notifikasi aktif'
    : permission === 'denied'
      ? 'Izin notifikasi diblokir'
      : permission === 'unsupported'
        ? 'Notifikasi sistem tidak didukung'
        : 'Notifikasi belum diaktifkan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="sipandu-notification-title" className="w-full max-w-md bg-[#0e1d11] border border-rose-500/40 rounded-2xl p-5 md:p-6 shadow-2xl text-white">
        <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-sky-300" />
            <div>
              <h3 id="sipandu-notification-title" className="text-base font-bold text-white">Notifikasi Responden</h3>
              <p className="mt-0.5 text-[10px] text-neutral-400">Khusus pengisian kuisioner dan asesmen</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup notifikasi" className="p-1 rounded text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-sky-400/25 bg-sky-950/25 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
            <Smartphone className="h-4 w-4" />
            {permissionLabel}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-300">
            Notifikasi sistem hanya dibuat untuk respons kuisioner baru atau asesmen responden yang baru diperbarui. Status sinkronisasi, perubahan profil, dan unggah foto tidak membuat notifikasi.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-neutral-300">
            <span className="inline-flex items-center gap-1"><Volume2 className="h-3 w-3" /> Bunyi sistem</span>
            <span className="inline-flex items-center gap-1"><Vibrate className="h-3 w-3" /> Getar bila diizinkan</span>
            <span className="inline-flex items-center gap-1"><BellRing className="h-3 w-3" /> Banner/layar kunci</span>
          </div>
          {permission !== 'granted' && (
            <button type="button" onClick={() => void enable()} disabled={permissionBusy || permission === 'unsupported'} className="mt-3 w-full rounded-lg border border-sky-300/40 bg-sky-800/80 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">
              {permissionBusy ? 'Meminta izin…' : 'Aktifkan Notifikasi Ponsel'}
            </button>
          )}
          {permissionMessage && <p role="status" className="mt-2 text-[11px] leading-relaxed text-sky-100">{permissionMessage}</p>}
        </div>

        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">Riwayat Notifikasi</h4>
          {unreadCount > 0 && <button type="button" onClick={onMarkAllRead} className="inline-flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-100"><CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca</button>}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {notifications.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/30 px-4 py-8 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-neutral-500" />
              <p className="text-sm font-semibold text-neutral-200">Belum ada respons baru</p>
              <p className="mt-1 text-xs text-neutral-400">Notifikasi muncul saat SIPANDU mendeteksi pengisian kuisioner atau asesmen responden berikutnya.</p>
            </div>
          )}
          {notifications.map((item) => (
            <article key={item.id} className={`rounded-xl border p-3.5 text-xs ${item.read ? 'border-white/10 bg-black/35 text-neutral-300' : 'border-rose-500/45 bg-[#152e19] text-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold">{item.title}</span>
                {!item.read && <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold">BARU</span>}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-300">{item.body}</p>
              <p className="mt-2 text-[10px] text-sky-300/80">{new Date(item.createdAt).toLocaleString('id-ID')}</p>
            </article>
          ))}
        </div>

        <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-rose-500/30 bg-black/60 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-black/80">
          Tutup
        </button>
      </section>
    </div>
  );
};
