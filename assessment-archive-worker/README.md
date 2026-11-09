# SIPANDU Assessment Archive Worker

This worker receives the already-rendered official assessment PDF, verifies the Firebase staff session and role, writes the PDF into one configured Google Drive folder, then reads the file back and verifies its MIME type, byte size, parent folder and SIPANDU archive marker.

## Required configuration

- `FIREBASE_PROJECT_ID`: the SIPANDU Firebase project ID.
- `FIREBASE_AUTH_API_KEY`: Firebase Web API key used by Identity Toolkit `accounts:lookup`.
- `GOOGLE_DRIVE_FOLDER_ID`: one existing Google Drive folder ID. The worker never creates folders or silently falls back to Drive root.
- Secret `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`: dedicated Google service-account JSON. Share only the configured destination folder with its `client_email`, preferably as Contributor/Content manager as appropriate.

The service account should be dedicated to this archive worker. Its private key must be stored only as a Cloudflare Worker secret, never in Vite variables, Firestore, Git, or the mobile app.

## Endpoints

- `GET /health`: checks configuration and verifies that the destination folder is accessible and is an active Drive folder.
- `POST /archive`: requires a Firebase ID token in the Bearer header and multipart form fields `ppksId` and `file` (PDF).

The worker derives a non-reversible archive key from the internal PPKS ID, uses it as a Drive appProperty for idempotent replacement, and names files without respondent names or NIK. It verifies the saved file with Drive `files.get` before returning `verified: true`.

## Important deployment gate

Do not deploy until the folder is verified and shared with the service account, the Worker secret is configured, and the `/health` endpoint returns `ready: true`. This first version retries transient Drive failures during the request but does not yet provide a durable background queue; a Cloudflare Queue/R2 or equivalent outbox is a separate infrastructure step.
