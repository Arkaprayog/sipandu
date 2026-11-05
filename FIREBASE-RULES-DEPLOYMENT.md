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

After the secret is available, re-run the failed **SIPANDU Firebase Security Rules** workflow on the latest `main` commit, or run it manually from **Actions** with `deploy_production=true`.

The workflow first runs Firestore and Storage emulator tests. The production job then checks that `.firebaserc` and `firebase.json` still point to the exact SIPANDU project/database and runs:

```bash
firebase deploy --only firestore:rules --project gen-lang-client-0197631978 --non-interactive
```

The project currently has one Firestore database entry in `firebase.json`, so this publishes the checked-in Firestore Rules to the named SIPANDU database only. It does not publish Storage Rules, indexes, or modify Firestore documents.

A successful workflow deploy step is the evidence that production Rules were published. A successful emulator test alone is not that evidence.
