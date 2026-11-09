# SIPANDU Firestore Rules production deployment

SIPANDU stores member profiles in the named Firestore database below. Emulator tests do not publish Security Rules to Firebase production.

- Firebase project: `gen-lang-client-0197631978`
- Firestore database: `ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8`
- Rules source: `firestore.rules`

## One-time GitHub configuration

1. Open the GitHub repository `Arkaprayog/sipandu`.
2. Go to **Settings → Secrets and variables → Actions → New repository secret**.
3. Create a secret named exactly `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Set its value to the complete JSON key for a dedicated Google Cloud service account in project `gen-lang-client-0197631978`. Do not commit the JSON key or send it in chat.
5. Grant that service account the **Firebase Rules Admin** role (`roles/firebaserules.admin`) on this project. This role manages Firebase Rules releases/rulesets; it is narrower than Project Owner.

## Deploy and verify

The GitHub secret and narrowly scoped service account are configured. The production deployment was verified successful on 6 November 2026 (commit `17e3633d5e98956170fcfc549ff67e9d8332d387`, workflow run [42140673270](https://github.com/Arkaprayog/sipandu/actions/runs/42140673270)).

The workflow first runs Firestore and Storage emulator tests. The production job then checks that `.firebaserc` and `firebase.json` still point to the exact SIPANDU project/database and runs:

```bash
firebase deploy --only firestore:rules --project gen-lang-client-0197631978 --non-interactive
```

The project currently has one Firestore database entry in `firebase.json`, so this publishes the checked-in Firestore Rules to the named SIPANDU database only. It does not publish Storage Rules, indexes, or modify Firestore documents. The production log confirmed that `firestore.rules` compiled and that the latest deployed rules were already up to date.

## Firebase Storage status (no paid upgrade)

The owner has declined upgrading the Firebase project to the Blaze billing plan. No Firebase Storage bucket was initialized, and this workflow intentionally does not deploy Storage Rules or attempt to create a bucket. Storage rules are still tested in the local Firebase Emulator only.

The current dashboard's PPKS records and integrated-assessment answers use Cloud Firestore; integrated-assessment backup files are handled through the existing Google Drive integration. The legacy Surat Tugas editor and its signed public PDF source were removed during the November 2026 security hardening because the editor was not part of the active dashboard and its file-storage path depended on the uninitialized Firebase Storage bucket. Do not reintroduce that screen or a signed personal document under `public/`; migrate any future document workflow to a private, authenticated store first. Cloudflare R2 was not provisioned for SIPANDU in this audit; the two existing R2 buckets belong to other projects and must not be reused for SIPANDU data.

A successful workflow deploy step is the evidence that production Rules were published. A successful emulator test alone is not that evidence.

## Integrated assessment answer storage

The current standalone **From Asesmen Terintegrasi** form stores its answer map in the staff-only Firestore collection `integratedAssessmentAnswers/{ppksId}`. This collection is independent from the spreadsheet-owned `ppks/{ppksId}` roster so a verified `pendamping` can save form answers even when the roster document has not yet been synchronized. The document contains only the PPKS source ID, answer map, writer UID, and update timestamp; it cannot create or modify the respondent's profile or identity fields. When the `ppks` document exists, SIPANDU also mirrors the answer map there for compatibility with older app builds.

Production Firestore Rules must include the `integratedAssessmentAnswers` match block before the updated app attempts to save to this collection. The `firebase-rules.yml` workflow runs emulator tests first and deploys only the Firestore Rules to the named SIPANDU database after a successful push to `main`.


## Perubahan jalur Arsip Dokumen Petugas pada v5.0.4

Fitur Arsip Dokumen Petugas tidak lagi mengunggah binary ke Firebase Storage. File disimpan pada folder privat akun Google Workspace SIPANDU melalui sipandu-assessment-archive Worker. Worker memverifikasi Firebase ID token dan custom role (owner, supervisor, pendamping), memastikan Google OAuth token berasal dari akun Workspace yang ditetapkan, membatasi ukuran dan MIME type, menandai file dengan appProperties SIPANDU, lalu membaca ulang metadata sebelum menyatakan upload berhasil.

Firestore staffDocuments hanya menyimpan metadata, driveFileId, dan tautan Drive non-publik. Download dan delete melewati Worker; Worker memverifikasi bahwa file memiliki penanda SIPANDU dan membatasi akses kepada pemilik dokumen, owner, atau supervisor. Firebase Storage bucket tetap tidak dibuat, tidak ada layanan berbayar yang diaktifkan, dan storage.rules tetap diuji melalui emulator saja.

Dokumen lama yang hanya memiliki storagePath Firebase Storage tidak otomatis dipindahkan atau dihapus. Dokumen tersebut harus dipulihkan dari backup Drive yang sudah ada atau diunggah ulang dari file aslinya. Dokumen lama yang memakai Drive backup sebelum penanda SIPANDU v5.0.4 juga harus diunggah ulang agar Worker dapat memverifikasi kepemilikan dan aksesnya. Jangan menganggap data lama sudah dimigrasikan hanya karena build baru berhasil.

### Pengujian operasional wajib setelah deployment

1. Masuk sebagai masing-masing role staf dan hubungkan akun Workspace yang ditetapkan.
2. Unggah PDF sintetis dan gambar; pastikan Worker mengembalikan verified=true dan file tampil pada folder SIPANDU/Dokumen.
3. Unduh sebagai pemilik; pastikan byte dan MIME type sesuai file asli.
4. Coba unduh dokumen petugas lain sebagai akun pendamping; Worker harus menolak.
5. Pastikan metadata Firestore baru tidak berisi storagePath atau downloadUrl.
