import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const KEEP_EMAILS = new Set(['denyarifinmartyons@gmail.com','arypayoga139@gmail.com']);
const execute = process.argv.includes('--execute');
if (!PROJECT_ID) { console.error('Set GOOGLE_CLOUD_PROJECT to the exact SIPANDU Firebase project ID.'); process.exit(1); }
if (execute && process.env.CONFIRM_SIPANDU_ACCOUNT_CLEANUP !== 'DELETE_NON_ALLOWLISTED_SIPANDU_AUTH_USERS') {
 console.error('Refusing deletion: explicit confirmation environment variable is required.'); process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth(); const targets=[]; let pageToken;
do {
 const page=await auth.listUsers(1000,pageToken);
 for (const user of page.users) {
  const email=(user.email||'').trim().toLowerCase();
  if (email && !KEEP_EMAILS.has(email)) targets.push({uid:user.uid,email,disabled:user.disabled});
 }
 pageToken=page.pageToken;
} while(pageToken);
console.log(JSON.stringify({projectId:PROJECT_ID,mode:execute?'EXECUTE':'DRY_RUN',preservedEmails:[...KEEP_EMAILS],accountsFoundForDeletion:targets.length,targets,warning:'Deletes Firebase Auth users only. Does not delete Firestore profiles/data, Storage files, Google Workspace accounts, or Worker KV registration records.'},null,2));
if(!execute) { console.log('Dry run only. No accounts changed. Review targets and backups before explicit execution.'); process.exit(0); }
const failures=[];
for(const target of targets) { try { await auth.deleteUser(target.uid); console.log('Deleted Firebase Auth user:',target.email); } catch(error) { failures.push({email:target.email,error:error instanceof Error?error.message:String(error)}); } }
console.log(JSON.stringify({deleted:targets.length-failures.length,failed:failures.length,failures},null,2));
if(failures.length) process.exitCode=1;
