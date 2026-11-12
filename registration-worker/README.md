# SIPANDU registration service

The registration Worker is separate from the static `sipandu` app Worker. It verifies Firebase ID tokens, records a short-lived self-registration state, checks verified email ownership and disabled-account status, then assigns only the least-privilege `anggota` custom claim. New self-registration requires no team code, invitation, or administrator approval. The `anggota` role is deliberately excluded from Firestore and Storage staff access rules.

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

The Firebase project ID and named Firestore database ID are non-secret Worker variables in `wrangler.jsonc`. The KV binding is already included there. The app's Firebase client API key remains visible in `firebase-applet-config.json` by design; it must be restricted in Google Cloud Console to the Firebase APIs and application origins actually used by SIPANDU.

New members self-register with their name, email, and password. The web app creates the Firebase Authentication identity and its UID-owned basic profile, then calls `/register`. The Worker stores a `pending_email` record in `PENDING_REGISTRATIONS`; no team code, invitation, Owner approval, or Supervisor approval is required. Firebase sends the email-verification link. After the link is opened, the member signs in and `/activate` verifies the Firebase ID token, exact UID/email match, verified email, pending self-registration record, and non-disabled account before assigning only the `anggota` custom claim. Existing `owner`, `supervisor`, and `pendamping` claims are never overwritten. Disabled Firebase accounts are rejected.

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

The `/health` endpoint returns `ready: true` when the Firebase Auth API key, project ID, and service-account secret are configured. Member activation does not require the KV binding; KV remains configured for public-intake rate limiting.

## Registration flow

1. The member enters their name, email, and password on the public registration page.
2. SIPANDU creates the Firebase Authentication account, stores the basic profile in `userProfiles/{uid}`, sends the verification email, and signs out.
3. The member opens the verification link and returns to SIPANDU to sign in.
4. `/register` records `pending_email` against the verified Firebase UID and normalized email. The app sends the email-verification link and signs out.
5. After verifying the email, the member signs in. `/activate` checks the UID/email-bound KV record, Firebase `emailVerified`, and disabled status, then assigns `role: anggota` server-side.
6. SIPANDU refreshes the ID token and shows an isolated basic-member screen. This role cannot read/write PPKS, integrated assessments, stage-one intake, staff documents, service records, field visits, Direct Messages, or staff Storage paths. It can manage only its UID-owned profile. An administrator must separately assign an existing staff role to grant operational access.

The Worker never accepts a role from the browser. Only the server can assign the `anggota` claim after email verification; the browser cannot self-select `pendamping`, `supervisor`, or `owner`. Profile documents cannot contain a role field, and Firestore Rules restrict each profile to its matching Firebase UID. Legacy Owner-approval endpoints remain only for historical pending requests and are not part of the new self-registration path.

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
