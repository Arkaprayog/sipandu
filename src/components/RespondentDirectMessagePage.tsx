import React, { useEffect, useState } from 'react';
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { MessageCircle, Send, ShieldCheck } from 'lucide-react';
import { auth, staffAuthPersistenceReady } from '../lib/firebase';
import {
  subscribeToDirectMessageConversation,
  subscribeToDirectMessages,
  sendDirectMessage,
  type DirectMessage,
} from '../lib/directMessages';

type PortalState = 'loading' | 'signed-out' | 'respondent' | 'wrong-account';

const formatTime = (date: Date | null): string => date
  ? date.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Mengirim…';

export const RespondentDirectMessagePage: React.FC = () => {
  const [portalState, setPortalState] = useState<PortalState>('loading');
  const [respondentId, setRespondentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [conversationExists, setConversationExists] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void staffAuthPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!active) return;
        setError('');
        if (!user) {
          setRespondentId('');
          setPortalState('signed-out');
          return;
        }
        setPortalState('loading');
        try {
          const token = await getIdTokenResult(user, true);
          if (!active) return;
          const claim = token.claims.ppksId;
          if (token.claims.role !== 'responden' || typeof claim !== 'string' || !claim.trim() || claim.includes('/')) {
            setRespondentId('');
            setPortalState('wrong-account');
            return;
          }
          setRespondentId(claim);
          setPortalState('respondent');
        } catch (authError) {
          if (!active) return;
          setError(authError instanceof Error ? authError.message : String(authError));
          setPortalState('wrong-account');
        }
      });
    }).catch((authError) => {
      if (!active) return;
      setError(authError instanceof Error ? authError.message : String(authError));
      setPortalState('signed-out');
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    setConversationExists(false);
    if (portalState !== 'respondent' || !respondentId) return;
    let unsubscribeMessages: (() => void) | undefined;
    const unsubscribeConversation = subscribeToDirectMessageConversation(
      respondentId,
      (conversation) => {
        setConversationExists(Boolean(conversation));
        unsubscribeMessages?.();
        unsubscribeMessages = undefined;
        if (!conversation) {
          setMessages([]);
          return;
        }
        unsubscribeMessages = subscribeToDirectMessages(
          respondentId,
          setMessages,
          (listenerError) => setError(listenerError.message),
        );
      },
      (listenerError) => setError(listenerError.message),
    );
    return () => {
      unsubscribeConversation();
      unsubscribeMessages?.();
    };
  }, [portalState, respondentId]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (portalState !== 'respondent' || !respondentId || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendDirectMessage(respondentId, draft);
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    setError('');
    try {
      await signOut(auth);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : String(logoutError));
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#07140d] px-3 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-emerald-100/15 bg-[#102017] shadow-2xl">
        <header className="border-b border-white/10 bg-[#13291c] px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-200">
              <MessageCircle className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Portal Responden SIPANDU</p>
              <h1 className="text-xl font-black">Direct Message</h1>
            </div>
            {portalState === 'respondent' && (
              <button type="button" onClick={() => void handleLogout()} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-white/5">
                Keluar
              </button>
            )}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs leading-relaxed text-emerald-100/65">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
            Kanal komunikasi pribadi dengan petugas SIPANDU. Pesan hanya dikirim saat Anda menekan tombol Kirim.
          </p>
        </header>

        {portalState === 'loading' ? (
          <div className="flex flex-1 items-center justify-center text-sm text-emerald-100/65">Memeriksa akun SIPANDU…</div>
        ) : portalState === 'signed-out' ? (
          <form onSubmit={handleLogin} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
            <div>
              <h2 className="text-lg font-bold">Masuk ke akun responden</h2>
              <p className="mt-1 text-xs leading-relaxed text-emerald-100/60">
                Gunakan akun responden SIPANDU yang telah diaktifkan oleh petugas. Akun petugas tidak dapat digunakan untuk masuk ke portal ini.
              </p>
            </div>
            <label className="grid gap-1.5 text-xs font-semibold text-emerald-100/80">
              Email akun responden
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-emerald-100/15 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-emerald-300/60"
                placeholder="nama@email.com"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-emerald-100/80">
              Kata sandi
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-emerald-100/15 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:border-emerald-300/60"
                placeholder="Masukkan kata sandi"
              />
            </label>
            <button type="submit" disabled={loginBusy} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-[#052216] hover:bg-emerald-400 disabled:opacity-50">
              {loginBusy ? 'Memeriksa akun…' : 'Masuk'}
            </button>
            <p className="text-center text-[11px] text-emerald-100/45">Portal resmi SIPANDU · Tidak menggunakan WhatsApp</p>
          </form>
        ) : portalState === 'wrong-account' ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-amber-300" />
            <h2 className="mt-3 text-lg font-bold">Akun ini belum terdaftar sebagai responden</h2>
            <p className="mt-2 text-xs leading-relaxed text-emerald-100/60">
              Portal hanya menerima akun dengan identitas responden SIPANDU yang diterbitkan dan diverifikasi oleh petugas. Sesi tidak akan diakhiri otomatis.
            </p>
            <button type="button" onClick={() => void handleLogout()} className="mt-5 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5">
              Keluar dan gunakan akun responden
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5" aria-live="polite">
              {!conversationExists && messages.length === 0 && (
                <div className="mx-auto my-auto max-w-sm py-10 text-center">
                  <MessageCircle className="mx-auto h-10 w-10 text-emerald-300/60" />
                  <h2 className="mt-3 text-sm font-bold">Mulai percakapan dengan petugas</h2>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-100/55">
                    Tulis pesan Anda. Pesan akan masuk ke kanal SIPANDU petugas yang berwenang atas pendampingan Anda.
                  </p>
                </div>
              )}
              {messages.map((message) => {
                const own = message.senderUid === auth.currentUser?.uid;
                return (
                  <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                    <article className={`max-w-[88%] rounded-2xl px-3 py-2.5 ${own
                      ? 'rounded-br-md bg-emerald-600 text-white'
                      : 'rounded-bl-md border border-white/10 bg-[#203329] text-emerald-50'}`}>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                      <p className={`mt-1 text-right text-[10px] ${own ? 'text-emerald-50/70' : 'text-emerald-100/45'}`}>
                        {own ? 'Anda' : 'Petugas SIPANDU'} · {formatTime(message.createdAt)}
                      </p>
                    </article>
                  </div>
                );
              })}
            </div>
            {error && <p role="alert" className="mx-3 mb-2 rounded-lg border border-rose-400/25 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <form onSubmit={(event) => void handleSend(event)} className="border-t border-white/10 bg-[#0c1912] p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-emerald-100/15 bg-black/20 p-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                  rows={2}
                  maxLength={4000}
                  placeholder="Tulis pesan Anda…"
                  className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-emerald-100/35"
                />
                <button type="submit" disabled={!draft.trim() || sending} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-[#052216] hover:bg-emerald-400 disabled:opacity-40">
                  <Send className="h-4 w-4" />
                  {sending ? 'Mengirim' : 'Kirim'}
                </button>
              </div>
              <p className="mt-1 px-2 text-right text-[10px] text-emerald-100/35">{draft.length}/4.000 karakter</p>
            </form>
          </>
        )}
        {error && portalState !== 'respondent' && (
          <p role="alert" className="border-t border-rose-400/20 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{error}</p>
        )}
      </div>
    </main>
  );
};
