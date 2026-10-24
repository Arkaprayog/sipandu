import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [emailArg, roleArg] = process.argv.slice(2);
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

const allowedRoles = new Set(['owner', 'supervisor', 'pendamping']);
if (!projectId) {
  console.error('ERROR: Set GOOGLE_CLOUD_PROJECT to the exact Firebase project ID.');
  process.exit(1);
}
if (!emailArg || !allowedRoles.has(roleArg)) {
  console.error('Usage: npm run set-role -- <email> <owner|supervisor|pendamping>');
  process.exit(1);
}
if (roleArg === 'owner' && process.env.CONFIRM_OWNER_ASSIGNMENT !== 'YES') {
  console.error('Refusing to assign owner without explicit confirmation.');
  console.error('Set CONFIRM_OWNER_ASSIGNMENT=YES only after verifying the target email and your administrator access.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(emailArg.trim());
const claims = { ...(user.customClaims || {}), role: roleArg };
await auth.setCustomUserClaims(user.uid, claims);
console.log(JSON.stringify({
  projectId,
  uid: user.uid,
  email: user.email,
  role: roleArg,
  note: 'The user must sign out and sign in again (or refresh their ID token) for the new claim to appear.'
}, null, 2));
