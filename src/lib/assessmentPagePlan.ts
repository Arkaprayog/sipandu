export const ORIGINAL_ASSESSMENT_FORM_PAGE_COUNT = 6;
export const ASSESSMENT_PHOTO_APPENDIX_PAGE_COUNT = 4;
export const OFFICIAL_ASSESSMENT_PDF_SECTION_COUNT =
  ORIGINAL_ASSESSMENT_FORM_PAGE_COUNT + ASSESSMENT_PHOTO_APPENDIX_PAGE_COUNT;

export interface OfficialAssessmentPageSections<T> {
  formPages: T[];
  photoPages: T[];
}

/**
 * Enforce the original PDF order: six source-form pages, then four photo pages.
 * Form-page raster overflow is handled later by the PDF renderer and does not
 * change the order of the four photo appendices.
 */
export function splitOfficialAssessmentPageSections<T>(
  sections: readonly T[],
): OfficialAssessmentPageSections<T> {
  if (
    !Array.isArray(sections) ||
    sections.length !== OFFICIAL_ASSESSMENT_PDF_SECTION_COUNT
  ) {
    throw new Error(
      'PDF harus berisi enam halaman formulir asli dan empat lampiran foto.',
    );
  }

  return {
    formPages: sections.slice(0, ORIGINAL_ASSESSMENT_FORM_PAGE_COUNT),
    photoPages: sections.slice(
      ORIGINAL_ASSESSMENT_FORM_PAGE_COUNT,
      OFFICIAL_ASSESSMENT_PDF_SECTION_COUNT,
    ),
  };
}
