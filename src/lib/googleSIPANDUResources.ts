/**
 * Verified from the URLs supplied by the SIPANDU project owner.
 * These are resource identifiers only; they do not prove the current Google account
 * has permission to access the resources.
 */
export const GOOGLE_WORKSPACE_EMAIL = 'aryprayoga139@gmail.com';

export const GOOGLE_SIPANDU_RESOURCES = {
  formEditorUrl: 'https://docs.google.com/forms/d/12JJIlBzY9yA5taFIfkQ6r0dJDMEBbEw8ymX7mTUHmYc/edit',
  formRespondentUrl: 'https://docs.google.com/forms/d/12JJIlBzY9yA5taFIfkQ6r0dJDMEBbEw8ymX7mTUHmYc/viewform',
  formId: '12JJIlBzY9yA5taFIfkQ6r0dJDMEBbEw8ymX7mTUHmYc',
  responseSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1ISR8v6QdDVHLjWjjDO5lIjhvEG-Ukt1KSZtfjx817BQ/htmlview',
  responseSpreadsheetId: '1ISR8v6QdDVHLjWjjDO5lIjhvEG-Ukt1KSZtfjx817BQ',
  driveFolderUrl: 'https://drive.google.com/drive/u/0/mobile/folders/1TtUYxMv9-f5kcGWqYS_5PK7NwYqUvNgMMV0l1BpzoLdkHJAQ7Ucxg0rbqc9Ue19Wo2w85GV1',
  driveFolderId: '1TtUYxMv9-f5kcGWqYS_5PK7NwYqUvNgMMV0l1BpzoLdkHJAQ7Ucxg0rbqc9Ue19Wo2w85GV1',
} as const;


/** Extract a Form ID only from full Google Forms URLs; short forms.gle links cannot be checked safely. */
export function getGoogleFormIdFromUrl(value: string | undefined): string {
  const raw = String(value || '').trim();
  const match = raw.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/i);
  return match?.[1] || '';
}

/** The project-level response sheet belongs to this primary Form, not the independent stage-one link/barcode Form. */
export function isPrimaryGoogleFormUrl(value: string | undefined): boolean {
  const formId = getGoogleFormIdFromUrl(value);
  return Boolean(formId && formId === GOOGLE_SIPANDU_RESOURCES.formId);
}
