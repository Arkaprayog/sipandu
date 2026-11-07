# SIPANDU team registration service

The registration Worker is separate from the static `sipandu` app Worker. It validates the shared team code, verifies Firebase ID tokens, stores short-lived pending invitations in Cloudflare KV, and assigns only the `pendamping` custom claim after Firebase confirms the email is verified.

## Cloudflare resources

- Worker: `sipandu-registration`
- URL used by the app: `https://sipandu-registration.aryprayoga139.workers.dev`
- KV binding: `PENDING_REGISTRATIONS`
- KV namespace ID: `49fbf170f6f6410f9ae787a7cc63ffb9`

The KV namespace has already been created. The existing app Worker `sipandu` is not replaced or modified by this configuration. Registration endpoints accept JSON only and enforce a 12,000-byte streaming body limit, including requests without a `Content-Length` header.

## Configure Firebase

1. Open Google Cloud Console and select Firebase project `gen-lang-client-0197631978`.
2. Create a dedicated service account for this registration Worker.
3. Create a least-privilege custom IAM role that grants `firebaseauth.users.update`, `datastore.entities.create`, and `datastore.databases.get`, then grant that role to the service account on the Firebase project. The first permission is required for Identity Toolkit role assignment; the Datastore permissions let the Turnstile gateway create only new public intake records in Firestore. Avoid granting project Owner or broad Firebase Admin roles.
4. Create a JSON key and download it. **Do not commit this file to GitHub, place it in the app, or send it in chat.**
5. In Firebase Authentication, enable Email/Password sign-in and confirm that the email verification template and sender settings are working.

## Configure Cloudflare secrets

Open Cloudflare Dashboard → Workers & Pages → `sipandu-registration` → Settings → Variables and Secrets. Add these as **Secret** values:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON key downloaded from Google Cloud.
- `FIREBASE_AUTH_API_KEY`: a **dedicated, separate** Google API key used only by the server-side Identity Toolkit lookup. It is stored as a Worker Secret, not checked into Git. The value currently provisioned during setup was copied from the public browser Firebase config only as a temporary bootstrap; it is not yet a separate restricted key and must be replaced before production with a key restricted to Identity Toolkit API. Do not reuse the browser key for the server after that replacement.
- `TURNSTILE_SECRET_KEY`: the secret for the SIPANDU public intake Turnstile widget. It must never be placed in the browser bundle.
- `TEAM_REGISTRATION_CODE`: one strong, random shared code (prefer 32 or more random characters) that the administrator shares only with SIPANDU team members.

The Firebase project ID and named Firestore database ID are non-secret Worker variables in `wrangler.jsonc`. The KV binding is already included there. The app's Firebase client API key remains visible in `firebase-applet-config.json` by design; it must be restricted in Google Cloud Console to the Firebase APIs and application origins actually used by SIPANDU.

The shared `TEAM_REGISTRATION_CODE` is checked when a new member registers. Once the Worker has stored that member's pending invitation, the `/activate` endpoint does not need the shared code again; it requires the Firebase service-account secret, Firebase project/API settings, and the KV binding. This lets a member complete email verification even if the shared code has since been rotated or removed. The `/health` endpoint still reports the full service as not ready when any required secret is missing, because new registrations also depend on the shared code.

## Restore an invitation for an existing account

If Firebase already contains the member account but its pending KV invitation is missing or has expired, the signed-in user can restore it without creating another Firebase account:

1. Sign in using the existing email and password, then finish email verification.
2. On the retained-session screen, enter the current shared team registration code and choose **Pulihkan undangan akun yang sama**.
3. The Worker verifies the Firebase ID token, verified email, UID, and team code, then writes a new seven-day invitation for that exact UID.
4. SIPANDU immediately retries activation. The Worker grants only the `pendamping` role and never accepts a role supplied by the browser.

This recovery path rejects accounts that already have the `owner` or `supervisor` role. Those roles must be managed administratively; do not use member-invitation recovery for an administrator account. No new Firebase account is created by this route.

## Deploy the Worker

The reviewed source of truth is `index.ts`. The production workflow installs locked dependencies, bundles the TypeScript source to a temporary `index.runtime.js` using esbuild, validates the generated JavaScript, runs the Worker security tests, then deploys the bundle with Wrangler. The generated runtime bundle is not committed to the repository.

From the repository root in a trusted terminal:

```sh
bun install --frozen-lockfile
bunx esbuild registration-worker/index.ts --bundle --format=esm --platform=browser --target=es2022 --outfile=registration-worker/index.runtime.js
node --check registration-worker/index.runtime.js
bunx tsx --test registration-worker/index.test.ts
cd registration-worker
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

## Deploy the profile Firestore Rules

After reviewing and testing `firestore.rules`, deploy the updated rules to the exact named database configured by SIPANDU:

```sh
firebase deploy --only firestore:ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8 --project gen-lang-client-0197631978
```

This rules deployment is separate from the Cloudflare Worker deployment. Registration cannot save profiles across devices until the matching Firestore Rules are active on the Firebase database.


## Public respondent intake protection

The public Asesmen Tahap Awal form renders the managed Turnstile widget using the public sitekey in `src/lib/turnstile.ts`. The browser sends its short-lived token and validated form payload to `/public-stage-one-intake`; this Worker checks Turnstile Siteverify success, the exact allowed hostname, and the expected action before using the dedicated server identity to create the Firestore document. The Firestore client rules no longer allow anonymous browser writes to `stageOneIntake`; staff browser writes remain limited to the validated `staff-entry` source.

The Turnstile widget is registered for `sipanduodhiv.my.id` and `sipandu.aryprayoga139.workers.dev`. Add a domain deliberately in both the Cloudflare Turnstile widget and the Worker `ALLOWED_ORIGINS` set before publishing the form from a new host. Rate limiting remains enabled in Cloudflare KV in addition to the managed challenge.

## Origins

The Worker currently allows the production app origin and the Capacitor localhost origins used by the Android app. Add any future production hostname deliberately to `ALLOWED_ORIGINS` before using it.
