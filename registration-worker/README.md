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
3. Create a least-privilege custom IAM role that grants only `firebaseauth.users.update`, then grant that role to the service account on the Firebase project. The Identity Toolkit `projects.accounts.update` endpoint requires this permission. Avoid granting project Owner or broad Firebase Admin roles.
4. Create a JSON key and download it. **Do not commit this file to GitHub, place it in the app, or send it in chat.**
5. In Firebase Authentication, enable Email/Password sign-in and confirm that the email verification template and sender settings are working.

## Configure Cloudflare secrets

Open Cloudflare Dashboard → Workers & Pages → `sipandu-registration` → Settings → Variables and Secrets. Add these as **Secret** values:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete JSON key downloaded from Google Cloud.
- `TEAM_REGISTRATION_CODE`: one strong, random shared code (prefer 32 or more random characters) that the administrator shares only with SIPANDU team members.

The Firebase project ID and Web API key are already configured as non-secret Worker variables. The KV binding is already included in `wrangler.jsonc`.

The shared `TEAM_REGISTRATION_CODE` is checked when a new member registers. Once the Worker has stored that member's pending invitation, the `/activate` endpoint does not need the shared code again; it requires the Firebase service-account secret, Firebase project/API settings, and the KV binding. This lets a member complete email verification even if the shared code has since been rotated or removed. The `/health` endpoint still reports the full service as not ready when any required secret is missing, because new registrations also depend on the shared code.

## Deploy the Worker

From the `registration-worker` directory in a trusted terminal with Wrangler installed. The checked-in `index.runtime.js` is the JavaScript Worker entry point uploaded to Cloudflare; `index.ts` is the typed source reference:

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

## Deploy the profile Firestore Rules

After reviewing and testing `firestore.rules`, deploy the updated rules to the exact named database configured by SIPANDU:

```sh
firebase deploy --only firestore:ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8 --project gen-lang-client-0197631978
```

This rules deployment is separate from the Cloudflare Worker deployment. Registration cannot save profiles across devices until the matching Firestore Rules are active on the Firebase database.


## Origins

The Worker currently allows the production app origin and the Capacitor localhost origins used by the Android app. Add any future production hostname deliberately to `ALLOWED_ORIGINS` before using it.
