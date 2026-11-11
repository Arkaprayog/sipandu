# SIPANDU Direct Message — audit and implementation blueprint

Status: Fondasi chat internal Direct Message tersedia di aplikasi dan menggunakan Firestore. Fitur ini bukan pengirim WhatsApp dan belum memiliki notifikasi latar belakang. Aktivasi responden, penyiapan akun responden yang tepercaya, serta pengujian dua perangkat tetap menjadi prasyarat penggunaan produksi.

## Product decision

Build a first-party, two-way, human-composed messaging channel inside SIPANDU. Respondents use the official `https://sipanduodhiv.my.id` portal; staff use the existing SIPANDU app. Firestore is the conversation source of truth. Google Workspace, Sheets, Drive, WhatsApp Cloud API, unofficial WhatsApp Web automation, bots, broadcasts, and scheduled outbound messages are not part of this feature.

WhatsApp may remain a separately opened fallback, but it is not synchronized into the in-app conversation. Only messages actually sent through Direct Message are represented as chat messages.

## Repository audit (default branch at audit time)

- `src/lib/firebase.ts` initializes the primary Firebase app and Firestore, and initializes staff Firebase Auth with durable browser persistence (native: IndexedDB then browser persistence; web: browser then IndexedDB). It exports `staffAuthPersistenceReady`. This is an existing foundation; do not replace it without reproducing the auth lifecycle tests.
- Google Workspace OAuth is already isolated in a separate Firebase app named `sipandu-workspace-auth`. Direct Message must use the primary SIPANDU auth and must not call Workspace token helpers.
- `src/App.tsx` owns the staff authenticated shell and lazy-loaded navigation. It already subscribes to `/ppks` through `subscribeToPPKSChanges`; this is the roster source to reuse, not Google Sheets from the chat view.
- `src/components/BottomNav.tsx` defines the existing navigation keys and currently has no Direct Message entry.
- `firestore.rules` defines staff roles `owner`, `supervisor`, and `pendamping`, and ends with a deny-by-default catch-all. There are no Direct Message collection rules yet. Do not weaken the catch-all.
- The existing respondent-facing `StageOneRespondentPage` is an intake/assessment workflow, not a respondent chat account or authenticated inbox. Respondent identity enrollment and account recovery are therefore required.
- `package.json` currently reports version `5.0.11`. Any eventual feature release must update all platform version surfaces and run the full release matrix, but this design-only PR does not bump versions.

## Recommended architecture

### Identity and enrollment

1. Staff authentication continues to use the existing Firebase Auth instance and existing custom role claims.
2. Add a respondent account with a distinct Firebase Auth UID and a server-controlled mapping document `respondentAccounts/{uid}` containing only `respondentId`, `status`, `createdAt`, and enrollment metadata.
3. Never link a person to a PPKS record by a name or phone-number match alone. Require a staff-assisted, single-use, short-lived enrollment invitation tied to one stable PPKS document ID, followed by verification of the respondent's phone number. The invitation must be consumed by a trusted server endpoint/Cloud Function; clients cannot create or edit account mappings.
4. Staff must verify the person's identity using the organization's approved process before issuing an invitation. Provide account suspension and recovery.

### Firestore data model

- `respondentAccounts/{uid}`: server-managed identity-to-PPKS mapping.
- `conversations/{respondentId}`: one private conversation per respondent; contains `respondentId`, `participantUids`, `assignedStaffUids`, `createdAt`, `lastMessageAt`, `lastMessagePreview` (strictly limited, no sensitive health details), and per-user read cursor metadata.
- `conversations/{respondentId}/messages/{messageId}`: append-only message records with `senderUid`, `body`, `createdAt` (server timestamp), and `type: 'text'`. Start with text-only; add private attachments only after Storage authorization and retention are designed.
- `userNotificationTokens/{uid}/tokens/{tokenId}`: per-device FCM token metadata, with token writes restricted to the authenticated owner and server cleanup for invalid tokens.

Do not copy NIK, HIV status, diagnoses, assessment answers, photos, or other PPKS profile data into chat documents. Use the stable PPKS document ID as the relationship key. Display the respondent roster by sorting the already-authorized PPKS records by `namaLengkap` using the existing Indonesian locale helper.

### Access-control policy

- Respondent: read only their own account mapping and conversation; create a message only when `senderUid == request.auth.uid` and the account is active; cannot edit/delete messages or alter participants, assignment, read cursors, or conversation metadata.
- Staff owner/supervisor: access conversations according to an explicit operational policy and audit logging.
- Staff pendamping: access only respondents explicitly assigned to their UID. Do not assume all `/ppks` records are assigned to every pendamping.
- All account mappings and participant/assignment changes are server-controlled. No client may grant itself a role or add itself to a conversation.
- Keep the existing deny-by-default rule. Add narrowly scoped matches with strict field allowlists, type/length checks, immutable sender and timestamps, and membership checks.
- Test both allowed and denied paths with Firebase Rules Unit Testing before any rules deployment. Rules are not deployed as part of this design work.

### Realtime delivery and notifications

- Use Firestore `onSnapshot` listeners for the open conversation and inbox; unsubscribe on navigation, sign-out, account switch, or permission change.
- Persist messages with server timestamps and paginate older history; do not load an unbounded message collection.
- Foreground: render incoming messages from Firestore listeners.
- Background/locked device: send a generic FCM notification such as “Ada pesan baru di SIPANDU” with no message body, respondent name, HIV/health information, or other sensitive content. Deep-link only after authentication and authorization.
- Android native: configure FCM and verify notification permission/channel behavior.
- iOS/PWA: configure APNs and verify supported installed-PWA notification behavior separately; do not promise identical background behavior on every browser/platform.
- Offline: show pending/sending state, use Firestore offline persistence only after reviewing shared-device privacy and local cache behavior, and reconcile server acknowledgement before showing sent status.

### Session persistence

The existing staff Auth persistence initialization is already present. Audit the actual logout path before changing it. Do not disable security expiry, role revocation, or explicit sign-out. The UI must wait for `staffAuthPersistenceReady` before treating initial auth restoration as signed out. Add regression tests for app resume, browser reload, native activity recreation, Workspace OAuth isolation, revoked role, and explicit logout.

### Abuse prevention and privacy

- No bots, auto-replies, broadcasts, scheduled outbound messages, or WhatsApp automation.
- All messages are explicitly composed and submitted by a signed-in user.
- Add per-account send throttling and server-side abuse controls before launch; show rate-limit feedback.
- Keep message bodies out of push payloads, analytics, logs, crash reports, and lock-screen previews.
- Define retention, export, correction, deletion/legal hold, incident response, and user consent/notice with the data controller before production.
- Use TLS, Firebase Security Rules, least privilege, and a documented access audit. Client-side UI filtering is not security.

## Delivery phases and acceptance criteria

### Phase 0 — complete before implementation
- Confirm Firebase project/database ID and deployed rules revision.
- Inspect full `/ppks` schema, stable IDs, staff assignment source, and whether all current 44 roster records are in Firestore.
- Confirm portal routing/hosting and whether a separate respondent auth entry point can coexist with the staff shell.
- Confirm Firebase Phone Auth/SMS quota, billing, authorized domains, reCAPTCHA, and account-recovery process.
- Confirm FCM/APNs credentials and platform-specific notification requirements.
- Agree operational policy for supervisor visibility, pendamping assignment, and message retention.

### Phase 1 — secure foundation
- Implement server-mediated enrollment and respondent account mapping.
- Add Rules Unit Tests for owner, supervisor, assigned/unassigned pendamping, active/inactive respondent, cross-respondent reads, forged sender UID, participant escalation, message edits/deletes, oversized/invalid content, and unauthenticated access.
- Do not enable chat UI until the rules tests pass.

### Phase 2 — text chat
- Add a separate respondent portal inbox and staff Direct Message menu.
- Alphabetical PPKS roster, search, assigned-contact filter, conversation inbox, text composer, pagination, unread/read state, and audit events.
- Verify two physical accounts exchange messages in both directions without refresh and without Workspace connectivity.

### Phase 3 — background notifications and session verification
- Validate Android FCM and iOS APNs/PWA behavior on real devices.
- Verify generic lock-screen notifications and authenticated deep links.
- Run auth/session regression suite.

### Phase 4 — controlled release
- Update all version surfaces together (Android PWA, iOS PWA, HarmonyOS PWA, APK Debug, APK Release).
- Run unit tests, TypeScript, Vite build, Firebase Rules emulator, Android debug/release signing verification, and platform smoke tests.
- Release only after explicit approval. Never deploy rules or production code from this design PR.

## Acceptance criteria

- A respondent can sign in to the official SIPANDU portal and see only their own conversation.
- An authorized staff member can find assigned respondents in A–Z order and send a manually composed text.
- Messages appear on both sides in realtime without refresh while online.
- Message history persists after app close/reopen and is paginated.
- Generic background notification works on each explicitly supported platform.
- A respondent cannot enumerate the PPKS roster or read another respondent's messages.
- An unassigned pendamping cannot open a respondent conversation.
- No message is sent automatically and no WhatsApp inbox scraping or unofficial automation is present.
- Chat continues to work when Google Workspace is disconnected.
- Existing PPKS roster, assessments, intake, and staff authentication remain intact.


## Implementation status — fondasi chat internal

Fondasi chat teks dua arah tersedia di aplikasi SIPANDU dan menggunakan Firestore. Fitur ini tidak mengirim pesan WhatsApp secara otomatis. Pada layar petugas, tombol **Buka WhatsApp** hanya menyiapkan draf melalui tautan resmi `wa.me`; petugas tetap harus menekan **Kirim** di aplikasi WhatsApp untuk mengirim pesan.

- Staff dashboard navigation includes **Direct Message**. The staff page displays the existing PPKS roster in Indonesian A–Z order and filters pendamping to records whose current `ppksServiceStatus/{ppksId}.assignedToUid` equals their UID.
- The respondent portal is reachable at `/?mode=direct-message`. It uses the primary SIPANDU Firebase Auth session and accepts only a trusted custom claim pair `role: "responden"` and `ppksId: "<stable PPKS document ID>"`.
- Conversation and text-message listeners use Firestore realtime snapshots. Message history is currently capped to the latest 50 records in the UI; message body length is 1–4,000 characters.
- Firestore Rules add explicit `conversations/{ppksId}` and `messages` access rules while preserving the deny-by-default catch-all. Respondents can access only the conversation whose path matches their custom `ppksId` claim; they cannot list conversations. Pendamping access is checked against the existing server-managed service assignment. Messages are append-only and cannot be edited/deleted or sent with a forged sender UID.
- Tests were added to the existing Firebase Rules Unit Test suite for assigned/unassigned pendamping, respondent cross-record isolation, forged sender, oversized message, message immutability, and first-message creation.

### Not yet implemented / release blockers

- Trusted respondent account enrollment, account recovery, suspension, and custom-claim provisioning endpoint are not included in this first code slice. The login page is not an account-registration mechanism. An administrator must not manually grant arbitrary client-supplied `ppksId` claims; the trusted enrollment process described above must be built and reviewed before opening respondent access to the public.
- Conversation notifications (FCM/APNs), attachment upload, unread counters, audit event pipeline, retention/export/deletion policy, rate limiting, and real-device tests are not included yet. Consequently, a respondent must open the authenticated SIPANDU portal to read a new in-app message; no WhatsApp or background notification is triggered.
- The latest 50-message query is a bounded initial view, not full historical pagination.
- Firestore Rules have only been added to the branch and must pass the emulator test workflow. They have not been deployed to any Firebase project. No production code or service settings are changed by this PR.
- The feature must not be enabled for live respondents until trusted claim provisioning exists, Rules Unit Tests pass, a two-account end-to-end test succeeds, and the data controller approves the privacy/retention policy.
