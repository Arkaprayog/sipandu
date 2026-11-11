# SIPANDU team registration service

The registration Worker is separate from the static `sipandu` app Worker. It verifies Firebase ID tokens, stores short-lived pending invitations in Cloudflare KV, and assigns only the `pendamping` custom claim after Firebase confirms the email is verified. Team registration does not use a shared code.

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

New members self-register with their name, email, and password. Firebase sends an email-verification link; after the link is opened, the member signs in and `/activate` verifies the Firebase ID token, the verified email, and the account status before assigning the least-privilege `pendamping` custom claim. Activation does not require a team code, invitation, pending KV record, or administrator-created account. Existing `owner` and `supervisor` claims are never overwritten. Disabled Firebase accounts are rejected.
