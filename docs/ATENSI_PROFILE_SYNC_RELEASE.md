# SIPANDU ODHIV — ATENSI Profile Sync Release

The authoritative PPKS profile source is the configured ATENSI response spreadsheet, tab `From Responses 1`.

The field mapping is centralized in `src/lib/atensiColumnMapping.ts` and verified by `src/lib/atensiColumnMapping.test.ts`.

The app pins manual and automatic PPKS imports to this source, reconciles the Firestore `ppks` collection against each successfully imported roster version, and protects destructive replacement by requiring the verified 44-person unique roster. The `stageOneIntake` collection is not part of the roster replacement.

Profile photo replacements take precedence over source-sheet photo links.
