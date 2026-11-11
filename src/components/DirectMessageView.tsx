import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, MessageCircle, Search, Send, ShieldCheck } from 'lucide-react';
import type { PPKSRecord, PPKSServiceStatus } from '../types';
import { createWhatsAppLink, formatPhoneNumberForWhatsApp } from '../utils/helpers';
import { deduplicatePPKSRecords, sortPPKSRecordsByName } from '../lib/ppksData';
import {
  subscribeToDirectMessageConversation,
  subscribeToDirectMessages,
  sendDirectMessage,
  type DirectMessage,
  type DirectMessageConversation,
} from '../lib/directMessages';

interface DirectMessageViewProps {
  ppksList: PPKSRecord[];
  serviceStatuses: PPKSServiceStatus[];
  currentUserUid: string;
  currentUserRole: string;
}

const formatMessageTime = (date: Date | null): string => date
  ? date.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Mengirim…';

export const DirectMessageView: React.FC<DirectMessageViewProps> = ({
  ppksList,
  serviceStatuses,
  currentUserUid,
  currentUserRole,
}) => {
  const isManager = currentUserRole === 'owner' || currentUserRole === 'supervisor';
  const assignedStatusById = useMemo(
    () => new Map(serviceStatuses.map((status) => [status.ppksId, status])),
    [serviceStatuses],
  );
  const visibleRespondents = useMemo(() => {
    const permitted = isManager
      ? ppksList
      : currentUserRole === 'pendamping'
        ? ppksList.filter((record) => assignedStatusById.get(record.id)?.assignedToUid === currentUserUid)
        : [];
    // The roster may combine cached, imported spreadsheet, and Firestore records.
    // Collapse confident identity duplicates before displaying any contact twice.
    return sortPPKSRecordsByName(deduplicatePPKSRecords(permitted));
  }, [ppksList, assignedStatusById, isManager, currentUserRole, currentUserUid]);

  const [search, setSearch] = useState('');
  const [selectedRespondentId, setSelectedRespondentId] = useState('');
  const [conversation, setConversation] = useState<DirectMessageConversation | null>(null);
  const [conversationLoaded, setConversationLoaded] = useState(false);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const filteredRespondents = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id-ID');
    if (!normalized) return visibleRespondents;
    return visibleRespondents.filter((person) =>
      String(person.namaLengkap || '').toLocaleLowerCase('id-ID').includes(normalized),
    );
  }, [visibleRespondents, search]);

  const selectedRespondent = visibleRespondents.find((person) => person.id === selectedRespondentId) || null;
  const whatsappPhone = selectedRespondent
    ? formatPhoneNumberForWhatsApp(String(selectedRespondent.noHpWa || ''))
    : '';
  const canOpenWhatsApp = /^62[0-9]{8,13}$/.test(whatsappPhone);

  // Start on the full A–Z contact list. Open a chat only after explicit selection.
  // If assignment is revoked or a contact leaves the permitted roster, return to
  // the list instead of silently switching the conversation to another respondent.
  useEffect(() => {
    if (selectedRespondentId && !visibleRespondents.some((person) => person.id === selectedRespondentId)) {
      setSelectedRespondentId('');
    }
  }, [selectedRespondentId, visibleRespondents]);

  useEffect(() => {
    setConversation(null);
    setConversationLoaded(false);
    setMessages([]);
    setError('');
    setSuccessNotice('');
    if (!selectedRespondentId) return;

    try {
      return subscribeToDirectMessageConversation(
        selectedRespondentId,
        (value) => {
          setConversation(value);
          setConversationLoaded(true);
        },
        (listenerError) => {
          setConversationLoaded(true);
          setError(listenerError.message);
        },
      );
    } catch (listenerError) {
      setConversationLoaded(true);
      setError(listenerError instanceof Error ? listenerError.message : String(listenerError));
    }
  }, [selectedRespondentId]);

  useEffect(() => {
    setMessages([]);
    if (!selectedRespondentId || !conversation) {
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    try {
      return subscribeToDirectMessages(
        selectedRespondentId,
        (items) => {
          setMessages(items);
          setLoadingMessages(false);
        },
        (listenerError) => {
          setLoadingMessages(false);
          setError(listenerError.message);
        },
      );
    } catch (listenerError) {
      setLoadingMessages(false);
      setError(listenerError instanceof Error ? listenerError.message : String(listenerError));
    }
  }, [selectedRespondentId, conversation]);

  const handleSend = async () => {
    if (!selectedRespondent || !draft.trim() || sending) return;
    const status = assignedStatusById.get(selectedRespondent.id);
    if (!isManager && status?.assignedToUid !== currentUserUid) {
      setError('Akses ditolak. Responden ini tidak tercatat sebagai penugasan akun Anda.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await sendDirectMessage(selectedRespondent.id, draft, {
        assignedStaffUid: status?.assignedToUid || '',
        canManageAssignments: isManager,
      });
      setDraft('');
      setSuccessNotice('Pesan berhasil disimpan di chat SIPANDU. Pesan ini tidak dikirim ke WhatsApp; responden harus masuk ke portal SIPANDU untuk membacanya.');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  };

  const handleOpenWhatsApp = () => {
    if (!selectedRespondent || !draft.trim()) {
      setError('Tulis pesan terlebih dahulu sebelum membuka WhatsApp.');
      setSuccessNotice('');
      return;
    }
    if (!canOpenWhatsApp) {
      setError('Nomor WhatsApp responden belum tersedia atau formatnya tidak valid. Perbarui nomor pada data PPKS.');
      setSuccessNotice('');
      return;
    }
    setError('');
    window.open(createWhatsAppLink(selectedRespondent.noHpWa, draft.trim()), '_blank', 'noopener,noreferrer');
    setSuccessNotice('WhatsApp dibuka dengan teks pesan. Pesan belum terkirim sampai Anda menekan tombol Kirim di aplikasi WhatsApp.');
  };

  return (
    <section className="mx-auto w-full max-w-7xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">Kanal komunikasi resmi</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Direct Message</h1>
          <p className="mt-1 max-w-2xl text-sm text-emerald-100/70">
            Percakapan dua arah melalui portal SIPANDU. Fitur ini bukan pengiriman WhatsApp.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/15 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-100">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          Akses mengikuti penugasan PPKS
        </div>
      </header>

      <div role="note" className="mb-3 rounded-xl border border-amber-300/25 bg-amber-950/25 px-3 py-3 text-xs leading-relaxed text-amber-100/90">
        <strong>Info pengiriman:</strong> tombol Kirim ke SIPANDU hanya menyimpan pesan di ruang chat aplikasi. Responden tidak menerima pesan WhatsApp atau notifikasi otomatis. Untuk menghubungi nomor WhatsApp, gunakan tombol Buka WhatsApp; Anda tetap harus menekan Kirim di WhatsApp.
      </div>
      <div className="grid min-h-[min(68vh,720px)] overflow-hidden rounded-2xl border border-white/10 bg-[#102017]/80 shadow-2xl md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={`border-b border-white/10 bg-[#0c1912]/90 md:border-b-0 md:border-r ${selectedRespondent ? 'hidden md:block' : 'block'}`}>
          <div className="border-b border-white/10 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">Daftar responden A–Z</p>
              <span className="shrink-0 text-[10px] font-medium text-emerald-100/45">
                {filteredRespondents.length === visibleRespondents.length
                  ? `${visibleRespondents.length} responden`
                  : `${filteredRespondents.length} dari ${visibleRespondents.length}`}
              </span>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-emerald-100/70">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama responden"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-emerald-100/35"
              />
            </label>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2 md:max-h-[calc(68vh-86px)]">
            {filteredRespondents.length ? filteredRespondents.map((person) => {
              const isSelected = person.id === selectedRespondentId;
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setSelectedRespondentId(person.id)}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${isSelected
                    ? 'border border-emerald-300/30 bg-emerald-500/15 text-white'
                    : 'border border-transparent text-emerald-50/80 hover:bg-white/5'}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-200">
                    {String(person.namaLengkap || '?').trim().charAt(0).toLocaleUpperCase('id-ID')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{person.namaLengkap || 'Nama tidak tersedia'}</span>
                    <span className="mt-0.5 block text-[11px] text-emerald-100/45">Percakapan SIPANDU</span>
                  </span>
                  {isSelected && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-300" />}
                </button>
              );
            }) : (
              <p className="px-3 py-6 text-center text-xs leading-relaxed text-emerald-100/55">
                {visibleRespondents.length
                  ? 'Tidak ada nama yang cocok dengan pencarian.'
                  : isManager
                    ? 'Roster PPKS belum tersedia.'
                    : 'Belum ada PPKS yang ditugaskan kepada akun Anda.'}
              </p>
            )}
          </div>
        </aside>

        <div className={`flex min-h-[min(68vh,720px)] flex-col ${selectedRespondent ? 'flex' : 'hidden md:flex'}`}>
          {selectedRespondent ? (
            <>
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#13291c]/80 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedRespondentId('')}
                  aria-label="Kembali ke daftar responden"
                  className="rounded-lg p-2 text-emerald-100/70 hover:bg-white/10 md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 font-bold text-emerald-200">
                  {String(selectedRespondent.namaLengkap || '?').trim().charAt(0).toLocaleUpperCase('id-ID')}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-white">{selectedRespondent.namaLengkap}</h2>
                  <p className="text-[11px] text-emerald-100/50">Pesan pribadi · SIPANDU</p>
                </div>
                <MessageCircle className="h-5 w-5 text-emerald-300" />
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5" aria-live="polite">
                {!conversationLoaded || loadingMessages ? (
                  <p className="py-8 text-center text-xs text-emerald-100/50">Memuat percakapan…</p>
                ) : !conversation && messages.length === 0 ? (
                  <div className="mx-auto mt-12 max-w-sm text-center">
                    <MessageCircle className="mx-auto h-10 w-10 text-emerald-300/60" />
                    <p className="mt-3 text-sm font-semibold text-white">Belum ada percakapan</p>
                    <p className="mt-1 text-xs leading-relaxed text-emerald-100/55">
                      Kirim pesan pertama untuk membuka kanal komunikasi pribadi. Responden dapat membalas dari portal resmi SIPANDU.
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-emerald-100/50">Belum ada pesan. Silakan mulai percakapan.</p>
                ) : messages.map((message) => {
                  const own = message.senderUid === currentUserUid;
                  return (
                    <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <article className={`max-w-[88%] rounded-2xl px-3 py-2.5 shadow ${own
                        ? 'rounded-br-md bg-emerald-600 text-white'
                        : 'rounded-bl-md border border-white/10 bg-[#203329] text-emerald-50'}`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                        <p className={`mt-1 text-right text-[10px] ${own ? 'text-emerald-50/70' : 'text-emerald-100/45'}`}>
                          {own ? 'Anda' : 'Responden'} · {formatMessageTime(message.createdAt)}
                        </p>
                      </article>
                    </div>
                  );
                })}
              </div>

              {successNotice && <p role="status" aria-live="polite" className="mx-3 mb-2 rounded-lg border border-emerald-300/25 bg-emerald-950/35 px-3 py-2 text-xs leading-relaxed text-emerald-100">{successNotice}</p>}
              {error && <p role="alert" aria-live="assertive" className="mx-3 mb-2 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs leading-relaxed text-rose-200">{error}</p>}
              <form
                className="border-t border-white/10 bg-[#0c1912]/80 p-3"
                onSubmit={(event) => { event.preventDefault(); void handleSend(); }}
              >
                <div className="flex items-end gap-2 rounded-2xl border border-emerald-100/15 bg-black/20 p-2">
                  <textarea
                    value={draft}
                    onChange={(event) => { setDraft(event.target.value.slice(0, 4000)); setSuccessNotice(''); }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Tulis pesan secara manual…"
                    className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-emerald-100/35"
                  />
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleOpenWhatsApp}
                      disabled={!draft.trim() || sending || !canOpenWhatsApp}
                      title={!canOpenWhatsApp ? 'Nomor WhatsApp responden belum valid' : 'Buka WhatsApp dengan teks pesan'}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300/35 bg-emerald-950/50 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-900/70 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Buka WhatsApp
                    </button>
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-[#052216] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                      {sending ? 'Menyimpan…' : 'Kirim ke SIPANDU'}
                    </button>
                  </div>
                </div>
                <p className="mt-1 px-2 text-right text-[10px] text-emerald-100/45">{draft.length}/4.000 karakter · WhatsApp dibuka sebagai draf; pengiriman harus dikonfirmasi di WhatsApp.</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-emerald-100/50">
              <MessageCircle className="h-12 w-12 text-emerald-300/40" />
              <p className="mt-3 text-sm font-semibold text-white">Pilih responden</p>
              <p className="mt-1 text-xs">Pilih nama pada daftar untuk membuka percakapan.</p>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-emerald-100/45">
        Chat SIPANDU hanya dapat dibaca melalui portal responden setelah akun aktif dan responden masuk. Fitur notifikasi latar belakang belum tersedia. Untuk WhatsApp, pastikan responden setuju dihubungi dan jangan tulis data medis, status kesehatan, NIK, atau informasi sensitif dalam pesan.
      </p>
    </section>
  );
};
