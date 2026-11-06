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

The current dashboard's PPKS records and integrated-assessment answers use Cloud Firestore; integrated-assessment backup files are handled through the existing Google Drive integration. The legacy `src/lib/documentStorage.ts` / `src/components/SuratTugasEditor.tsx` path still imports Firebase Storage but is not imported by the active dashboard route. Do not re-enable that legacy screen until its file-storage path is migrated and tested. Cloudflare R2 was not provisioned for SIPANDU in this audit; the two existing R2 buckets belong to other projects and must not be reused for SIPANDU data.

A successful workflow deploy step is the evidence that production Rules were published. A successful emulator test alone is not that evidence.
