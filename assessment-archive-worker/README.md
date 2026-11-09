# SIPANDU Assessment Archive Worker

This Worker receives the already-rendered official assessment PDF, verifies the Firebase staff session and role, verifies that the supplied short-lived Google OAuth token belongs to the configured SIPANDU Workspace account, uploads the PDF into an app-managed My Drive folder, and reads the saved file back to verify MIME type, byte size, parent folder and SIPANDU archive marker.

## Why user OAuth is required

The destination is a personal Google Drive (My Drive). Google documents that service accounts have no personal Drive storage quota and cannot own files; they must use a Shared Drive or OAuth 2.0 on behalf of a human user. SIPANDU therefore forwards the short-lived access token already issued by its Google Workspace connection. No service-account private key or long-lived Google refresh token is stored in the Worker.

## Configuration

- `FIREBASE_PROJECT_ID`: SIPANDU Firebase project ID.
- `FIREBASE_AUTH_API_KEY`: the same public Firebase Web API key already used by the frontend. It is a project identifier, not an authorization secret.
- `GOOGLE_WORKSPACE_EMAIL`: the one Google account allowed to archive files.

The browser sends the Firebase ID token in `Authorization` and the short-lived Google access token in `X-Google-Access-Token`. The Worker verifies the Firebase custom role and Google userinfo email before making Drive calls. Access tokens are used only for the current request and are never persisted or logged.

## Endpoints

- `GET /health`: checks required Worker configuration. It does not claim Drive-folder access until a real authenticated archive request runs.
- `POST /archive`: requires both authenticated tokens and multipart form fields `ppksId` and `file` (PDF).

The Worker creates/uses the app-managed folder path `SIPANDU/From Asesmen Terintegrasi/<opaque archive key>` with the user's OAuth token. This uses the existing app's `drive.file` scope and avoids a hard-coded, unverified folder ID. Files use an opaque archive key instead of respondent names or NIK. The Worker reads the saved file back with Drive `files.get` before returning `verified: true`.

## Deployment gates and limitations

1. Confirm the connected Google OAuth app can create files/folders using its existing `drive.file` scope. If Google denies access, the OAuth consent/scope or Google Picker authorization must be corrected before enabling this archive path.
2. Deploy the Worker and check `/health`.
3. Test with a synthetic PDF using an authorized staff session. Confirm the PDF exists under the app-managed folder and its MIME type/size match.
4. Only then enable this endpoint in production.

This first version retries transient Drive failures up to three times during the request and uses a deterministic archive key to avoid duplicate files. It does not yet provide a durable background retry queue; a Cloudflare Queue/R2 or equivalent outbox is a separate infrastructure step.
