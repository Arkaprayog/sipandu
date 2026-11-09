import React, { useEffect, useRef, useState } from "react";
import { Bot, BrainCircuit, X, Send, LoaderCircle, ShieldCheck, AlertCircle, Sparkles, Database, Clock3 } from "lucide-react";
import { auth } from "../lib/firebase";
import { SIPANDU_AI_WORKER_URL } from "../lib/sipanduAI";

type ChatMessage = { role: "user" | "model"; text: string; at: string };
type ChatMetadata = { generatedAt: string; recordsAnalyzed: number; serviceStatusRecordsAnalyzed: number | null; truncated: boolean; scope: string; sources: string[] };
type Props = { onClose: () => void };

const STARTER_PROMPTS = [
  "Analisis persebaran PPKS berdasarkan wilayah.",
  "Ringkas kebutuhan bantuan nutrisi dan kewirausahaan.",
  "Jelaskan gambaran status layanan yang sudah tercatat.",
  "Apa keterbatasan data yang perlu diperhatikan petugas?",
];

export const SIPANDUAICopilot: React.FC<Props> = ({ onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState<ChatMetadata | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendPrompt = async (rawPrompt: string) => {
    const question = rawPrompt.trim();
    if (!question || loading) return;
    if (question.length > 1200) {
      setError("Pertanyaan maksimal 1.200 karakter.");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError("Sesi SIPANDU tidak ditemukan. Silakan masuk kembali.");
      return;
    }

    setError("");
    setPrompt("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", text: question, at: new Date().toISOString() }]);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(SIPANDU_AI_WORKER_URL + "/api/chat", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + idToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: question,
          history: messages.filter((item) => item.role === "user").slice(-4).map((item) => ({ role: "user", text: item.text })),
        }),
        cache: "no-store",
        credentials: "omit",
      });
      const payload = await response.json() as { answer?: string; metadata?: ChatMetadata; message?: string };
      if (!response.ok) throw new Error(payload.message || "Layanan AI belum dapat memberikan jawaban.");
      if (!payload.answer) throw new Error("AI tidak mengembalikan jawaban.");
      setMessages((current) => [...current, { role: "model", text: payload.answer || "", at: new Date().toISOString() }]);
      setMetadata(payload.metadata || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Koneksi ke SIPANDU AI gagal.");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="sipandu-ai-title" className="flex h-[94dvh] max-h-[880px] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-emerald-300/20 bg-[#0d1913] text-white shadow-2xl sm:h-[min(88dvh,880px)] sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><BrainCircuit size={24} /></div>
            <div className="min-w-0">
              <h2 id="sipandu-ai-title" className="truncate text-base font-extrabold tracking-wide sm:text-lg">SIPANDU AI Copilot</h2>
              <p className="text-[11px] text-emerald-100/65">Asisten analisis pendampingan PPKS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200 sm:inline-flex"><ShieldCheck size={12} /> READ-ONLY</span>
            <button type="button" onClick={onClose} disabled={loading} aria-label="Tutup SIPANDU AI" className="rounded-xl border border-white/10 p-2 text-neutral-300 transition hover:bg-white/10 disabled:opacity-40"><X size={19} /></button>
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
            <div className="flex items-center gap-2 text-emerald-100"><Sparkles size={16} /><strong className="text-sm">Selamat datang di SIPANDU AI</strong></div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-300">Saya menganalisis ringkasan data yang diizinkan untuk akun Anda. Saya tidak dapat mengubah data SIPANDU atau mengambil keputusan layanan.</p>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] leading-relaxed text-amber-100/80">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              Jangan masukkan nama, NIK, alamat, nomor telepon, status kesehatan, isi asesmen, atau informasi pribadi ke dalam pertanyaan.
            </div>
          </div>

          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Mulai dengan salah satu pertanyaan</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((item) => (
                  <button key={item} type="button" onClick={() => void sendPrompt(item)} disabled={loading} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left text-xs leading-relaxed text-neutral-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/[0.07] disabled:opacity-40">{item}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.at + "-" + index} className={"flex " + (message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[94%] rounded-2xl px-4 py-3 " + (message.role === "user" ? "border border-sky-300/20 bg-sky-400/10 text-sky-50" : "border border-emerald-300/15 bg-white/[0.045] text-neutral-100")}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide opacity-65">{message.role === "user" ? "Anda" : <><Bot size={12} /> SIPANDU AI</>}</div>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed sm:text-sm">{message.text}</p>
              </div>
            </div>
          ))}

          {loading && <div className="flex items-center gap-2 text-xs text-emerald-100/80"><LoaderCircle size={15} className="animate-spin" /> Menganalisis ringkasan data SIPANDU…</div>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-950/30 p-3 text-xs text-rose-100"><AlertCircle size={15} className="mt-0.5 shrink-0" />{error}</div>}

          {metadata && (
            <div className="rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-neutral-300"><Database size={13} /> SUMBER ANALISIS</div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-400 sm:grid-cols-3">
                <span>PPKS dianalisis: <strong className="text-neutral-200">{metadata.recordsAnalyzed}</strong></span>
                <span>Status layanan: <strong className="text-neutral-200">{metadata.serviceStatusRecordsAnalyzed === null ? "disembunyikan (<5)" : metadata.serviceStatusRecordsAnalyzed}</strong></span>
                <span>{metadata.truncated ? "Data dibatasi hingga 10.000 per koleksi" : "Data tidak terpotong"}</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">{metadata.scope}</p>
              <p className="mt-1 text-[9px] leading-relaxed text-neutral-600">Sumber: {metadata.sources.join("; ")}</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-neutral-600"><Clock3 size={11} /> {new Date(metadata.generatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
          )}
        </div>

        <form className="border-t border-white/10 bg-black/20 p-3 sm:p-4" onSubmit={(event) => { event.preventDefault(); void sendPrompt(prompt); }}>
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-2 focus-within:border-emerald-300/35">
            <textarea ref={inputRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(prompt); } }} rows={2} maxLength={1200} placeholder="Tanyakan analisis data kepada SIPANDU AI…" aria-label="Pertanyaan untuk SIPANDU AI" className="max-h-32 min-h-[48px] flex-1 resize-y bg-transparent px-2 py-2 text-xs text-white outline-none placeholder:text-neutral-500 sm:text-sm" disabled={loading} />
            <button type="submit" disabled={loading || !prompt.trim()} aria-label="Kirim pertanyaan" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-[#062015] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}</button>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-neutral-600"><span>Jawaban AI perlu ditinjau petugas.</span><span>{prompt.length}/1200</span></div>
        </form>
      </section>
    </div>
  );
}
