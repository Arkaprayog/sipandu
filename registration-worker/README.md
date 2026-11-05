# SIPANDU team registration service

The registration Worker is separate from the static `sipandu` app Worker. It validates the shared team code, verifies Firebase ID tokens, stores short-lived pending invitations in Cloudflare KV, and assigns only the `pendamping` custom claim after Firebase confirms the email is verified.

## Cloudflare resources

- Worker: `sipandu-registration`
- URL used by the app: `https://sipandu-registration.aryprayoga139.workers.dev`
- KV binding: `PENDING_REGISTRATIONS`
- KV namespace ID: `49fbf170f6f6410f9ae787a7cc63ffb9`

The KV namespace has already been created. The existing app Worker `sipandu` is not replaced or modified by this configuration.

## Configure Firebase

1. Open Google Cloud Console and select Firebase project `gen-lang-client-0197631978`.
2. Create a dedicated service account for this registration Worker.
3. Grant only the Firebase Authentication administrative permission required to update Firebase Authentication users' custom claims (Firebase Authentication Admin).
4. Create a JSON key and download it. **Do not commit this file to GitHub, place it in the app, or send it in chat.**
5. In Firebase Authentication, enable Email/Password sign-in and confirm that the email verification template and sender settings are working.

## Configure Cloudflare secrets

Open Cloudflare Dashboard → Workers & Pages → `sipandu-registration` → Settings → Variables and Secrets. Add these as **Secret** values:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON key downloaded from Google Cloud.
- `TEAM_REGISTRATION_CODE`: one strong, random shared code (prefer 32 or more random characters) that the administrator shares only with SIPANDU team members.

The Firebase project ID and Web API key are already configured as non-secret Worker variables. The KV binding is already included in `wrangler.jsonc`.

## Deploy the Worker

From the `registration-worker` directory in a trusted terminal with Wrangler installed:

```sh
bunx wrangler deploy --config wrangler.jsonc
```

The `/health` endpoint returns `ready: true` only when both secrets and the KV binding are configured. It never returns secret values.

## Registration flow

1. SIPANDU checks service readiness and validates the shared code before creating a Firebase account.
2. The app creates the email/password account, stores the member's name, NIP, job title, and work unit in `userProfiles/{uid}`, creates a seven-day pending invitation, sends the verification email, and signs out.
3. After email verification, the member returns to SIPANDU and signs in again.
4. The Worker checks the Firebase identity and verification status, confirms the matching pending invitation, then assigns the `pendamping` custom claim.
5. SIPANDU refreshes the Firebase ID token and opens the dashboard. The profile fields are already filled from Firestore; the member can upload a photo. Edit Profile remains available.

The Worker never accepts a role from the browser. Profile documents cannot contain a role field, and Firestore Rules restrict each profile to its matching Firebase UID.

## Origins

The Worker currently allows the production app origin and the Capacitor localhost origins used by the Android app. Add any future production hostname deliberately to `ALLOWED_ORIGINS` before using it.
