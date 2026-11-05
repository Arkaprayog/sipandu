import React, { useState, useEffect, useRef } from 'react';
import { ProfileUser, SuratRecord } from '../types';
import { ACCEPTED_DOCUMENT_EXTENSIONS, deleteStaffDocument, listStaffDocuments, retryStaffDocumentDriveBackup, uploadStaffDocument, type StaffDocumentRecord } from '../lib/documentStorage';
import { printCurrentWebView, printSupportedBlob } from '../lib/printing';
import { listStaffLettersFromFirestore, saveStaffLetterToFirestore } from '../lib/letterStorage';
import { initialSuratList } from '../data/initialData';
import { KemensosLogo } from './KemensosLogo';
import { SuratTugasEditor } from './SuratTugasEditor';
import {
  FolderArchive,
  FileText,
  FileCheck2,
  Printer,
  Plus,
  Upload,
  Calendar,
  MapPin,
  User,
  Shield,
  Download,
  Check,
  Trash2,
  Loader2,
} from 'lucide-react';

interface DokumenViewProps {
  profile: ProfileUser;
}

export const DokumenView: React.FC<DokumenViewProps> = ({ profile }) => {
  const [activeTab, setActiveTab] = useState<'surat-tugas' | 'surat-lainnya'>('surat-tugas');
  const [suratList, setSuratList] = useState<SuratRecord[]>(initialSuratList);
  const [selectedSurat, setSelectedSurat] = useState<SuratRecord | null>(initialSuratList[0] || null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<StaffDocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string>('');
  const [documentNotice, setDocumentNotice] = useState<string>('');
  const [letterDriveLink, setLetterDriveLink] = useState<string>('');
  const [savingLetter, setSavingLetter] = useState<boolean>(false);
  const [retryingDocumentId, setRetryingDocumentId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const retryFileInputRef = useRef<HTMLInputElement | null>(null);
  const retryTargetRef = useRef<StaffDocumentRecord | null>(null);

  useEffect(() => {
    const onAppNavigateBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean }>).detail;
      if (!detail || detail.handled) return;
      if (showCreateModal) {
        setShowCreateModal(false);
        detail.handled = true;
        return;
      }
      if (showUploadModal) {
        setShowUploadModal(false);
        detail.handled = true;
        return;
      }
      if (activeTab !== 'surat-tugas') {
        setActiveTab('surat-tugas');
        detail.handled = true;
        return;
      }
      if (selectedSurat) {
        setSelectedSurat(null);
        detail.handled = true;
      }
    };
    window.addEventListener('sipandu:navigate-back', onAppNavigateBack);
    return () => window.removeEventListener('sipandu:navigate-back', onAppNavigateBack);
  }, [activeTab, selectedSurat, showCreateModal, showUploadModal]);

  useEffect(() => {
    let active = true;
    const loadLetters = async () => {
      try {
        const remote = await listStaffLettersFromFirestore();
        if (!active || remote.length === 0) return;
        setSuratList((previous) => {
          const merged = new Map(previous.map((item) => [item.id, item]));
          remote.forEach((item) => merged.set(item.record.id, item.record));
          return [...remote.map((item) => item.record), ...Array.from(merged.values()).filter((item) => !remote.some((saved) => saved.record.id === item.id))];
        });
      } catch (error) {
        if (active) setDocumentNotice(error instanceof Error ? error.message : 'Arsip surat Firestore belum dapat dimuat.');
      }
    };
    void loadLetters();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDocuments = async () => {
      setDocumentsLoading(true);
      try {
        const items = await listStaffDocuments();
        if (active) setUploadedDocuments(items);
      } catch (error) {
        if (active) {
          setDocumentNotice(error instanceof Error ? error.message : 'Arsip dokumen belum dapat dimuat.');
        }
      } finally {
        if (active) setDocumentsLoading(false);
      }
    };
    void loadDocuments();
    return () => { active = false; };
  }, []);

  const handleUploadFile = async (file: File) => {
    setUploadError('');
    setDocumentNotice('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const saved = await uploadStaffDocument(file, activeTab, setUploadProgress);
      setUploadedDocuments((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      setDocumentNotice(saved.driveBackupStatus === 'complete'
        ? `File “${saved.name}” tersimpan di Firebase dan arsip Google Drive utama SIPANDU.`
        : `File “${saved.name}” aman di Firebase, tetapi backup Google Drive belum berhasil: ${saved.driveBackupError || 'hubungkan ulang Google Workspace lalu unggah ulang file ini.'}`);
      setShowUploadModal(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'File gagal disimpan. Silakan coba lagi.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const beginDriveBackupRetry = (document: StaffDocumentRecord) => {
    retryTargetRef.current = document;
    retryFileInputRef.current?.click();
  };

  const handleDriveBackupRetryFile = async (file: File | undefined) => {
    const target = retryTargetRef.current;
    retryTargetRef.current = null;
    if (!file || !target) return;
    setRetryingDocumentId(target.id);
    setDocumentNotice('');
    try {
      const updated = await retryStaffDocumentDriveBackup(target.id, file);
      setUploadedDocuments((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      setDocumentNotice(`Salinan “${updated.name}” berhasil dibuat di Google Drive utama SIPANDU.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDocumentNotice(`Backup Google Drive gagal diulang: ${message}`);
      setUploadedDocuments((previous) => previous.map((item) => item.id === target.id
        ? { ...item, driveBackupStatus: 'failed', driveBackupError: message }
        : item));
    } finally {
      setRetryingDocumentId('');
      if (retryFileInputRef.current) retryFileInputRef.current.value = '';
    }
  };

  const openDocumentInViewer = (document: StaffDocumentRecord) => {
    const link = document.downloadUrl;
    const opened = window.open(link, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.download = document.name;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  };

  const handlePrintUploadedDocument = async (document: StaffDocumentRecord) => {
    if (!document.downloadUrl) {
      setDocumentNotice('Tautan file tidak tersedia. File mungkin perlu diunggah ulang.');
      return;
    }
    const extension = document.name.split('.').pop()?.toLowerCase() || '';
    const printableMime = extension === 'pdf'
      ? 'application/pdf'
      : ['jpg', 'jpeg'].includes(extension)
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : null;

    // Office, HEIC, GIF, TIFF, WEBP, large PDFs/images should open in the
    // native/browser viewer. Avoid converting large files into base64 in WebView.
    if (!printableMime || document.size > 5 * 1024 * 1024) {
      openDocumentInViewer(document);
      setDocumentNotice(
        document.size > 5 * 1024 * 1024
          ? 'File berukuran lebih dari 5 MB. File dibuka di penampil perangkat agar dapat dicetak dari sana.'
          : 'Format file dibuka melalui penampil perangkat. Gunakan menu Cetak pada penampil dokumen atau browser.',
      );
      return;
    }

    try {
      setDocumentNotice('Menyiapkan file untuk dialog cetak...');
      const response = await fetch(document.downloadUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('File tidak dapat diambil dari Firebase (HTTP ' + response.status + ').');
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024) {
        openDocumentInViewer(document);
        setDocumentNotice('File melebihi batas cetak langsung 5 MB. File dibuka di penampil perangkat.');
        return;
      }
      await printSupportedBlob(blob, document.name, printableMime);
      setDocumentNotice('Dialog cetak perangkat telah dibuka. Pilih printer atau Simpan sebagai PDF.');
    } catch (error) {
      console.warn('SIPANDU could not print the archive file directly:', error);
      openDocumentInViewer(document);
      setDocumentNotice(
        'Cetak langsung tidak tersedia pada perangkat ini. File dibuka di penampil dokumen; pilih Cetak dari menu penampil. ' +
        (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const handleDeleteDocument = async (document: StaffDocumentRecord) => {
    if (!window.confirm(`Hapus “${document.name}” dari arsip dokumen SIPANDU?`)) return;
    setDocumentNotice('');
    try {
      await deleteStaffDocument(document.id, document.storagePath);
      setUploadedDocuments((previous) => previous.filter((item) => item.id !== document.id));
      setDocumentNotice(`Dokumen “${document.name}” telah dihapus dari arsip.`);
    } catch (error) {
      setDocumentNotice(error instanceof Error ? error.message : 'Dokumen gagal dihapus.');
    }
  };

  const formatDocumentSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const visibleDocuments = uploadedDocuments.filter((item) => item.category === activeTab);

  // New surat state
  const [newNomorSurat, setNewNomorSurat] = useState<string>(
    `ST.03.02/REHSOS-ODHIV/${new Date().getMonth() + 1}/${new Date().getFullYear()}`
  );
  const [newJudul, setNewJudul] = useState<string>('');
  const [newLokasi, setNewLokasi] = useState<string>('');
  const [newTanggal, setNewTanggal] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [newDeskripsi, setNewDeskripsi] = useState<string>('');

  const handleCreateSurat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingLetter) return;
    if (!newJudul.trim() || !newLokasi.trim() || !newDeskripsi.trim()) {
      setDocumentNotice('Isi judul, lokasi, dan uraian dokumen sebelum menyimpan surat.');
      return;
    }
    if (!profile.nama.trim() || !profile.nip.trim()) {
      setDocumentNotice('Lengkapi nama dan NIP petugas di Profil SIPANDU sebelum membuat dokumen resmi.');
      return;
    }

    const newRecord: SuratRecord = {
      id: `SRT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nomorSurat: newNomorSurat,
      judul: newJudul,
      jenis: activeTab === 'surat-tugas' ? 'Surat Tugas' : 'Berita Acara',
      tanggal: newTanggal,
      petugas: profile.nama.trim(),
      nipPetugas: profile.nip.trim(),
      lokasi: newLokasi,
      status: 'Aktif',
      deskripsi: newDeskripsi.trim(),
    };

    setSavingLetter(true);
    setDocumentNotice('');
    setLetterDriveLink('');
    try {
      const saved = await saveStaffLetterToFirestore(newRecord);
      setSuratList((previous) => [saved.record, ...previous.filter((item) => item.id !== saved.record.id)]);
      setSelectedSurat(saved.record);
      setShowCreateModal(false);
      setNewJudul('');
      setNewDeskripsi('');
      setLetterDriveLink(saved.driveWebViewLink || '');
      setDocumentNotice(saved.driveBackupStatus === 'complete'
        ? 'Surat tersimpan di Firestore dan arsip salinan dibuat di Google Drive utama SIPANDU.'
        : 'Surat aman di Firestore, tetapi backup Google Drive belum berhasil: ' + (saved.driveBackupError || 'hubungkan ulang Google Workspace lalu ulangi.'));
    } catch (error) {
      setDocumentNotice(error instanceof Error ? error.message : 'Surat gagal disimpan ke Firestore.');
    } finally {
      setSavingLetter(false);
    }
  };

  const handlePrintSurat = async () => {
    try {
      await printCurrentWebView(selectedSurat ? `SIPANDU - ${selectedSurat.judul}` : 'SIPANDU - Dokumen');
    } catch (error) {
      console.warn('SIPANDU printer plugin unavailable; falling back to browser print:', error);
      window.print();
    }
  };

  return (
    <div className="workspace-page min-h-full space-y-4 text-white">
      {/* Bingkai Luar Menu DOKUMEN */}
      <div className="workspace-panel min-h-full p-3 sm:p-4 md:p-6 rounded-2xl bg-black/25 border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
        {/* Header Tab: Surat Tugas --->>> Surat Lainnya.. */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 mb-6 border-b border-rose-500/25">
          <div className="flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-sky-300" />
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-wider uppercase">
                DOKUMEN
              </h2>
              <p className="text-xs text-sky-200">
                Arsip & Generator Dokumen Resmi Pendampingan Kemensos RI
              </p>
            </div>
          </div>

          {/* 2 Tab: Surat Tugas --->>> Surat Lainnya.. */}
          <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-xl border border-rose-500/35">
            <button
              type="button"
              onClick={() => setActiveTab('surat-tugas')}
              className={`py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'surat-tugas'
                  ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-sky-300" />
              <span>Surat Tugas</span>
            </button>

            <span className="text-rose-400 text-xs font-mono font-bold">{'--->>>'}</span>

            <button
              type="button"
              onClick={() => setActiveTab('surat-lainnya')}
              className={`py-2 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'surat-lainnya'
                  ? 'bg-emerald-800 text-white border border-rose-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-sky-300" />
              <span>Surat Lainnya..</span>
            </button>
          </div>
        </div>

        {/* Action button bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-neutral-300">
            {activeTab === 'surat-tugas'
              ? 'Daftar Surat Tugas Pendampingan Sosial ODHIV Kemensos:'
              : 'Daftar Berita Acara, Surat Pernyataan, & Rujukan Medis:'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="py-2 px-3.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-xs font-bold text-white border border-rose-500/40 shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-300" />
              <span>{activeTab === 'surat-tugas' ? 'Buat Surat Tugas Baru' : 'Buat Dokumen Baru'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="py-2 px-3.5 rounded-xl bg-sky-950/70 hover:bg-sky-900 text-xs font-bold text-sky-200 border border-sky-500/40 shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-sky-300" />
              <span>Upload Berkas</span>
            </button>
          </div>
        </div>

        <SuratTugasEditor />

        {documentNotice && (
          <div role="status" aria-live="polite" className="rounded-xl border border-sky-400/25 bg-sky-950/40 px-3 py-2 text-xs text-sky-100 break-words">
            {documentNotice}
            {letterDriveLink && (
              <a href={letterDriveLink} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold underline underline-offset-2">
                Buka arsip surat di Google Drive
              </a>
            )}
          </div>
        )}

        {/* Real Firebase Storage archive. Upload confirmation is shown only after both
            the binary and its Firestore metadata have been committed successfully. */}
        <section className="rounded-2xl border border-sky-500/25 bg-black/25 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">Arsip Berkas yang Diunggah</h3>
              <p className="text-[10px] text-neutral-400">File tersimpan di Firebase Storage dan metadata arsip di Firestore.</p>
            </div>
            <span className="text-[10px] text-sky-200">{visibleDocuments.length} berkas</span>
          </div>
          <input
            ref={retryFileInputRef}
            type="file"
            accept={ACCEPTED_DOCUMENT_EXTENSIONS}
            className="hidden"
            onChange={(event) => { void handleDriveBackupRetryFile(event.currentTarget.files?.[0]); }}
          />
          {documentsLoading ? (
            <p className="text-xs text-neutral-400">Memuat arsip dokumen...</p>
          ) : visibleDocuments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-xs text-neutral-400">
              Belum ada berkas pada kategori ini. Gunakan tombol Upload Berkas untuk menyimpan dokumen.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleDocuments.map((document) => (
                <div key={document.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-sky-300" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{document.name}</p>
                    <p className="text-[10px] text-neutral-400">
                      {formatDocumentSize(document.size)} · {document.uploadedAt ? new Date(document.uploadedAt).toLocaleString('id-ID') : 'Waktu tersimpan'}
                      {document.ownerEmail ? ` · ${document.ownerEmail}` : ''}
                    </p>
                    <p className={`mt-1 text-[10px] font-semibold ${document.driveBackupStatus === 'complete' ? 'text-emerald-300' : document.driveBackupStatus === 'failed' ? 'text-amber-300' : 'text-sky-200'}`}>
                      {document.driveBackupStatus === 'complete' ? 'Backup Google Drive tersimpan' : document.driveBackupStatus === 'failed' ? 'Backup Google Drive belum berhasil' : 'Status backup Google Drive menunggu'}
                    </p>
                    {document.driveBackupStatus === 'failed' && document.driveBackupError && (
                      <>
                        <p className="mt-1 text-[10px] text-amber-200/80 break-words">{document.driveBackupError}</p>
                        <button
                          type="button"
                          onClick={() => beginDriveBackupRetry(document)}
                          disabled={retryingDocumentId === document.id}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-300/30 px-2 py-1 text-[10px] font-bold text-amber-100 disabled:opacity-50"
                        >
                          {retryingDocumentId === document.id ? 'Mengulang backup…' : 'Pilih ulang file untuk backup Drive'}
                        </button>
                      </>
                    )}
                  </div>
                  {document.driveWebViewLink && document.driveBackupStatus === 'complete' && (
                    <a href={document.driveWebViewLink} target="_blank" rel="noopener noreferrer" aria-label={`Buka salinan Google Drive ${document.name}`} className="rounded-lg p-2 text-emerald-200 hover:bg-emerald-900/50" title="Buka salinan di Google Drive">
                      <FileCheck2 className="h-4 w-4" />
                    </a>
                  )}
                  {document.downloadUrl && (
                    <>
                      <button type="button" onClick={() => void handlePrintUploadedDocument(document)} aria-label={`Cetak ${document.name}`} className="rounded-lg p-2 text-violet-200 hover:bg-violet-900/50" title="Cetak atau buka penampil perangkat">
                        <Printer className="h-4 w-4" />
                      </button>
                      <a href={document.downloadUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${document.name}`} className="rounded-lg p-2 text-sky-200 hover:bg-sky-900/50" title="Buka file Firebase">
                        <Download className="h-4 w-4" />
                      </a>
                    </>
                  )}
                  <button type="button" onClick={() => void handleDeleteDocument(document)} aria-label={`Hapus ${document.name}`} className="rounded-lg p-2 text-rose-300 hover:bg-rose-950/50" title="Hapus dari Firebase dan Google Drive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Main Content Grid: Surat List & Surat Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List of Surat */}
          <div className="lg:col-span-5 space-y-3">
            {suratList
              .filter((s) => (activeTab === 'surat-tugas' ? s.jenis === 'Surat Tugas' : s.jenis !== 'Surat Tugas'))
              .map((surat) => {
                const isSelected = selectedSurat?.id === surat.id;
                return (
                  <div
                    key={surat.id}
                    onClick={() => setSelectedSurat(surat)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#152e19] border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                        : 'bg-black/45 border-rose-500/25 hover:border-emerald-500/40 hover:bg-emerald-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-emerald-300 border border-emerald-500/30">
                        {surat.nomorSurat}
                      </span>
                      <span className="text-[10px] font-bold text-sky-300 bg-sky-950 px-2 py-0.5 rounded">
                        {surat.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {surat.judul}
                    </h4>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-sky-400" />
                        {surat.tanggal}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-rose-400" />
                        {surat.lokasi}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Surat Preview Card (Official Kop Kementerian Sosial RI) */}
          <div className="lg:col-span-7">
            {selectedSurat ? (
              <div className="print-container p-6 md:p-8 rounded-2xl bg-white text-neutral-900 border border-neutral-300 shadow-xl space-y-5">
                {/* Official Kop Surat Kemensos */}
                <div className="border-b-2 border-neutral-900 pb-3 text-center flex flex-col items-center">
                  <div className="flex items-center gap-3 mb-1">
                    <KemensosLogo size="mini" showText={false} />
                    <div className="text-left leading-tight">
                      <h3 className="font-extrabold text-sm md:text-base tracking-wider uppercase text-neutral-900">
                        KEMENTERIAN SOSIAL REPUBLIK INDONESIA
                      </h3>
                      <p className="text-[11px] font-semibold text-neutral-700">
                        DIREKTORAT REHABILITASI SOSIAL KORBAN PENYALAHGUNAAN NARKOBA & ODHIV
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-neutral-500">
                    Jalan Cawang Kencana No. 1, Jakarta Timur 13630 • Telp: (021) 3103591 • www.kemensos.go.id
                  </p>
                </div>

                {/* Surat Title & Number */}
                <div className="text-center space-y-1">
                  <h4 className="font-bold text-sm uppercase underline tracking-wider">
                    {selectedSurat.jenis.toUpperCase()}
                  </h4>
                  <p className="font-mono text-xs text-neutral-600">
                    Nomor: {selectedSurat.nomorSurat}
                  </p>
                </div>

                {/* Body Content */}
                <div className="space-y-3 text-xs leading-relaxed text-neutral-800">
                  <p>
                    Yang bertanda tangan di bawah ini Direktur Rehabilitasi Sosial Korban Penyalahgunaan Narkoba & ODHIV Kementerian Sosial RI, menugaskan kepada:
                  </p>

                  <div className="bg-neutral-100 p-3 rounded border border-neutral-200 grid grid-cols-3 gap-1 font-sans text-xs">
                    <span className="font-semibold">Nama:</span>
                    <span className="col-span-2 font-bold">{selectedSurat.petugas}</span>
                    <span className="font-semibold">NIP:</span>
                    <span className="col-span-2 font-mono">{selectedSurat.nipPetugas}</span>
                    <span className="font-semibold">Jabatan:</span>
                    <span className="col-span-2">Pendamping Sosial ODHIV Prov. Sumatera Utara</span>
                    <span className="font-semibold">Wilayah Tugas:</span>
                    <span className="col-span-2 text-emerald-800 font-semibold">{selectedSurat.lokasi}</span>
                  </div>

                  <p>
                    <strong>Untuk:</strong> {selectedSurat.deskripsi}
                  </p>
                  <p>
                    Demikian surat ini dibuat agar dapat dilaksanakan dengan penuh tanggung jawab dan melaporkan hasilnya kepada Direktur Rehabilitasi Sosial.
                  </p>
                </div>

                {/* Signature */}
                <div className="pt-4 flex justify-between items-end text-xs">
                  <div className="text-[10px] text-neutral-500">
                    <p>Dikeluarkan di: Medan</p>
                    <p>Pada tanggal: {selectedSurat.tanggal}</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">a.n. Direktur Jenderal Rehabilitasi Sosial</p>
                    <p className="text-[11px] text-neutral-600">Kasubdit ODHIV Kemensos RI</p>
                    <div className="h-16 flex items-center justify-center font-bold text-neutral-800 italic">
                      [Tanda Tangan & Cap Resmi]
                    </div>
                    <p className="font-bold underline">Drs. Supriyanto, M.Si</p>
                    <p className="font-mono text-[10px] text-neutral-600">NIP. 19680712 199303 1 001</p>
                  </div>
                </div>

                {/* Print Button */}
                <div className="pt-4 border-t border-neutral-200 flex justify-end gap-2 no-print">
                  <button
                    type="button"
                    onClick={handlePrintSurat}
                    className="py-2 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Cetak Surat Resmi</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-2xl bg-black/40 border border-dashed border-rose-500/30 text-center text-neutral-400">
                Pilih surat di sebelah kiri untuk melihat isi dan pratinjau cetak.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Buat Surat Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-lg bg-[#0e1c10] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white">
            <h3 className="text-base font-bold text-white mb-4 pb-2 border-b border-rose-500/30">
              Buat {activeTab === 'surat-tugas' ? 'Surat Tugas Baru' : 'Dokumen / Berita Acara Baru'}
            </h3>
            <form onSubmit={handleCreateSurat} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-sky-200 font-semibold mb-1">Nomor Surat:</label>
                <input
                  type="text"
                  value={newNomorSurat}
                  onChange={(e) => setNewNomorSurat(e.target.value)}
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 font-mono text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sky-200 font-semibold mb-1">Judul Surat / Perihal:</label>
                <input
                  type="text"
                  value={newJudul}
                  onChange={(e) => setNewJudul(e.target.value)}
                  placeholder="Contoh: Pendampingan Responden ODHIV Wilayah Siantar & Simalungun"
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sky-200 font-semibold mb-1">Wilayah / Lokasi Tugas:</label>
                  <input
                    type="text"
                    value={newLokasi}
                    onChange={(e) => setNewLokasi(e.target.value)}
                    className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sky-200 font-semibold mb-1">Tanggal Surat:</label>
                  <input
                    type="date"
                    value={newTanggal}
                    onChange={(e) => setNewTanggal(e.target.value)}
                    className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sky-200 font-semibold mb-1">Instruksi & Uraian Tugas:</label>
                <textarea
                  rows={3}
                  value={newDeskripsi}
                  onChange={(e) => setNewDeskripsi(e.target.value)}
                  placeholder="Uraikan rincian penugasan lapangan..."
                  className="w-full p-2.5 rounded bg-black/60 border border-rose-500/30 text-white"
                  required
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-black/60 hover:bg-black/80 text-neutral-300 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider"
                >
                  Simpan & Terbitkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Berkas Eksternal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-[#0e1c10] border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-white text-center space-y-4">
            <div className="p-3 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-300 mx-auto w-12 h-12 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Upload Dokumen Eksternal</h3>
            <p className="text-xs text-neutral-300">
              Unggah file PDF resmi formulir asesmen atau surat tugas (PDF, DOCX, scan JPEG).
            </p>

            <label className="block p-6 rounded-xl border-2 border-dashed border-rose-500/40 hover:border-sky-400 bg-black/50 cursor-pointer">
              <FileText className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              <span className="text-xs text-sky-300 font-semibold block">
                Klik atau seret file PDF / Dokumen ke sini
              </span>
              <span className="text-[10px] text-neutral-500">Maks. 25 MB</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                disabled={uploading}
                onChange={(e) => {
                  const selectedFile = e.currentTarget.files?.[0];
                  if (selectedFile) void handleUploadFile(selectedFile);
                }}
                className="hidden"
              />
            </label>

            <p className="text-[10px] text-neutral-400">Format: PDF, DOC/DOCX, JPG/JPEG, PNG, GIF, WEBP, BMP, TIFF, HEIC/HEIF · Maks. 25 MB.</p>
            {uploading && (
              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between text-[10px] text-sky-200">
                  <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Mengunggah dan menyimpan...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/60">
                  <div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            {uploadError && (
              <p role="alert" aria-live="assertive" className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-left text-xs text-rose-200">
                {uploadError}
              </p>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-lg bg-sky-700 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {uploading ? 'Sedang mengunggah...' : 'Pilih File dari Perangkat'}
            </button>
            <button
              type="button"
              onClick={() => { if (!uploading) { setShowUploadModal(false); setUploadError(''); } }}
              disabled={uploading}
              className="w-full py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs font-semibold disabled:opacity-50"
            >
              {uploading ? 'Tunggu sampai upload selesai' : 'Tutup'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
