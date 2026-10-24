# SIPANDU trusted role administration

This tool assigns Firebase Authentication custom claims using the Firebase Admin SDK. It must only run in a trusted administrator environment (for example, Google Cloud Shell signed in as a project administrator). Never put service-account keys, access tokens, or passwords in this repository or in the browser.

## Before running

1. Confirm the Firebase project ID is exactly `gen-lang-client-0197631978`.
2. In Firebase Authentication → Users, confirm the target account's email is correct.
3. Open Google Cloud Shell for the same project and ensure the signed-in Google account has IAM permission to administer Firebase Authentication.
4. Upload/copy this `admin-tools` directory to Cloud Shell through a trusted method. Do not upload any credential files to GitHub.
5. Run:

```sh
cd admin-tools
npm install
export GOOGLE_CLOUD_PROJECT=gen-lang-client-0197631978
export CONFIRM_OWNER_ASSIGNMENT=YES
npm run set-role -- 'EMAIL_AKUN_OWNER_ANDA' owner
```

Replace `EMAIL_AKUN_OWNER_ANDA` with the exact email you created. Do not share your password or session credentials.

For other staff, omit `CONFIRM_OWNER_ASSIGNMENT` and use the role `supervisor` or `pendamping` as appropriate.

## After assignment

1. Sign out of SIPANDU, then sign in again so Firebase refreshes the ID token.
2. The app should only accept the trusted custom claim `role` with one of `owner`, `supervisor`, or `pendamping`.
3. Test the Firestore rules in the Firebase Rules Playground or emulator before using real PPKS data.

## Critical deployment notes

- This command does not deploy Firestore rules. Review and deploy `firestore.rules` separately to the exact database configured by the app: `ai-studio-sipanduodhiv-985a0308-7693-46e1-b6d3-fdbce52371a8`. Confirm the database ID in Firebase Console before applying rules.
- The current front end still caches PPKS records, profile, and settings in browser `localStorage`. A login screen alone does not protect data stored on a device. Do not use real PPKS or health data until data access is migrated to authenticated Firestore reads/writes and verified with rules.
- Do not create a public "set role" endpoint. Only trusted administrators may assign custom claims.
