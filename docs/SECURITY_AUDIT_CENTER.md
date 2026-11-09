# SIPANDU Security & Audit Center

The owner/supervisor-only panel projects the newest 250 records from each of these existing append-only Firestore collections:

- `ppksServiceEvents`: structured service-status changes.
- `fieldVisits`: field-visit records.

The projection exposes only opaque PPKS record IDs, source/action/status, event date, actor UID, assigned UID, and Firestore creation timestamp. It deliberately omits respondent names, NIK, contact details, address, free-text visit summaries, and next-action notes.

Access is checked in the UI and enforced by Firestore Rules: only owner/supervisor roles may query all records in these two collections; pendamping access remains scoped to records assigned to their UID. The panel is read-only and does not create, update, or delete business records.

## Explicit limitations

This is an operational audit view, not a complete security event management system. It does not currently capture successful/failed sign-ins, custom-claim changes, Firebase/Cloudflare configuration changes, Google Workspace activity, document deletions, or events outside the two collections above. The displayed feed is capped at 250 newest records per source; older records remain in their source collections but are not shown in this view. Production enforcement of the checked-in Firestore Rules must be confirmed separately in Firebase.
