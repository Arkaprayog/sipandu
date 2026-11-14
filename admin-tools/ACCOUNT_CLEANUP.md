# SIPANDU account cleanup (v5.1.3)

Protected addresses:
- `denyarifinmartyons@gmail.com` — existing SIPANDU account.
- `arypayoga139@gmail.com` — Google Workspace address; also protected if present in Firebase Authentication.

## Procedure
1. Verify the exact production Firebase project ID and administrator credentials.
2. Export/backup the Firebase Authentication user list and review dependent records.
3. From `admin-tools`, run `npm install`.
4. Dry run: `GOOGLE_CLOUD_PROJECT=<project-id> npm run cleanup-accounts`.
5. Review every target. The script only targets users with an email not in the protected allowlist.
6. Only after explicit operational approval, run:
   `GOOGLE_CLOUD_PROJECT=<project-id> CONFIRM_SIPANDU_ACCOUNT_CLEANUP=DELETE_NON_ALLOWLISTED_SIPANDU_AUTH_USERS npm run cleanup-accounts -- --execute`.

## Scope
The utility deletes Firebase Authentication users only. It does not delete Firestore `userProfiles`, PPKS/respondent data, assessments, Storage files, Google Workspace accounts, or registration Worker KV records. Pending `pending:` KV entries must be separately reviewed and cleaned; this script cannot access that store. The utility is not run by CI/deployments.

## Biometrics
Existing SIPANDU biometric support is device-local quick unlock (native Android biometric prompt / WebAuthn platform authenticator) after account authentication. It is not server-verified facial liveness or identity proofing. Existing users can sign in and enroll/reenroll from **Pengaturan → Biometrik → Aktifkan**. Do not describe device biometrics as liveness. True liveness-based registration/login needs a dedicated liveness provider, server-side challenge verification, anti-replay protections, and a recovery fallback; it is not enabled by this version.
