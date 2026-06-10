import { extractDocumentText } from './extractText.js';
import { parseLineItemsFromOcrText } from './parseLineItems.js';
import type { OcrLineSuggestion } from './types.js';

export type { OcrLineSuggestion, DocumentOcrLineDraft, DocumentOcrLineField } from './types.js';
export {
  applyAllOcrSuggestions,
  applyOcrSuggestionToItem,
  getApplicableOcrFields,
  isLineFieldEmpty,
} from './applySuggestions.js';
export { parseLineItemsFromOcrText } from './parseLineItems.js';

export async function analyzeDocumentFile(
  file: File,
  options?: { catalogLabels?: string[] },
): Promise<OcrLineSuggestion[]> {
  const text = await extractDocumentText(file);
  return parseLineItemsFromOcrText(text, options?.catalogLabels ?? []);
}
