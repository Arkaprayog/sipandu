export interface AssessmentPrintFailureStatusInput {
  localCopyText: string;
  primaryPrintError: unknown;
  fallbackPrintError: unknown;
  localSaveError?: string;
  backupError?: string;
}

function describePrintError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.trim() || 'Penyebab tidak dilaporkan oleh layanan cetak';
}

/**
 * A completed save/download is not a successful print. Keep the status in the
 * error state whenever both the PDF and prepared-page print paths fail.
 */
export function createAssessmentPrintFailureStatus(
  input: AssessmentPrintFailureStatusInput,
): { type: 'error'; text: string } {
  const details = [
    'Cetak PDF: ' + describePrintError(input.primaryPrintError),
    'Cetak halaman A4: ' + describePrintError(input.fallbackPrintError),
    input.localSaveError ? 'Penyimpanan lokal: ' + input.localSaveError : '',
    input.backupError ? 'Backup Google Drive: ' + input.backupError : '',
  ].filter(Boolean);

  return {
    type: 'error',
    text: input.localCopyText + ' Pencetakan tidak berhasil melalui kedua metode. ' + details.join('. ') + '.',
  };
}
