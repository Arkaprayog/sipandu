# SIPANDU Assessment Archive Worker

This Worker receives the already-rendered official assessment PDF, verifies the Firebase staff session and role, verifies that the supplied short-lived Google OAuth token belongs to the configured SIPANDU Workspace account, uploads the PDF into one configured My Drive folder, and reads the saved file back to verify MIME type, byte size, parent folder and SIPANDU archive marker.

## Why user OAuth is required

The configured destination is a personal Google Drive (My Drive) folder. Google documents that service accounts have no personal Drive storage quota and cannot own files; they must use a Shared Drive or OAuth 2.0 on behalf of a human user. SIPANDU therefore forwards the short-lived access token already issued by its Google Workspace connection. No service-account private key or long-lived Google refresh token is stored in the Worker.

## Required configuration

- `FIREBASE_PROJECT_ID`: SIPANDU Firebase project ID.
- Secret `FIREBASE_AUTH_API_KEY`: Firebase Web API key used by Identity Toolkit `accounts:lookup`.
- `GOOGLE_WORKSPACE_EMAIL`: the one Google account allowed to archive files.
- `GOOGLE_DRIVE_FOLDER_ID`: one existing destination folder ID.

The browser sends the Firebase ID token in `Authorization` and the short-lived Google access token in `X-Google-Access-Token`. The Worker verifies the Firebase custom role and Google userinfo email before making Drive calls. Access tokens are used only for the current request and are never persisted or logged.

## Endpoints

- `GET /health`: checks that required Worker configuration exists. It does not claim Drive-folder access until a real authenticated archive request runs.
- `POST /archive`: requires both authenticated tokens and multipart form fields `ppksId` and `file` (PDF).

The Worker derives a non-reversible archive key from the internal PPKS ID, uses it as a Drive appProperty for idempotent replacement, and names files without respondent names or NIK. It verifies the saved file with Drive `files.get` before returning `verified: true`.

## Deployment gates and limitations

1. Ensure the configured folder is accessible for writing by the connected Google OAuth app. The current app requests `drive.readonly` and `drive.file`; if Google rejects writes to the existing folder, the folder must be selected/authorized through Google Picker or the OAuth scope/consent setup must be updated.
2. Set `FIREBASE_AUTH_API_KEY` as a Cloudflare Worker secret.
3. Deploy the Worker, then test with a synthetic PDF using an authorized staff session.
4. Only then enable this endpoint in production.

This first version retries transient Drive failures up to three times during the request and uses a deterministic archive key to avoid duplicate files. It does not yet provide a durable background retry queue; a Cloudflare Queue/R2 or equivalent outbox is a separate infrastructure step.
