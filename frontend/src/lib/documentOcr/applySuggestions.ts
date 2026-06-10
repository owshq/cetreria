import type {
  DocumentOcrLineDraft,
  DocumentOcrLineField,
  OcrLineSuggestion,
} from './types.js';

export function isLineFieldEmpty(item: DocumentOcrLineDraft, field: DocumentOcrLineField): boolean {
  switch (field) {
    case 'name':
      return !item.name.trim();
    case 'description':
      return !item.description.trim();
    case 'quantity':
      return !Number.isFinite(item.quantity) || item.quantity <= 0;
    case 'price':
      return !Number.isFinite(item.price) || item.price === 0;
    default:
      return false;
  }
}

export function getApplicableOcrFields(
  item: DocumentOcrLineDraft,
  suggestion: OcrLineSuggestion,
): DocumentOcrLineField[] {
  const fields: DocumentOcrLineField[] = [];
  if (isLineFieldEmpty(item, 'name') && suggestion.name.trim()) fields.push('name');
  if (isLineFieldEmpty(item, 'description') && suggestion.description?.trim()) {
    fields.push('description');
  }
  if (
    suggestion.quantity != null &&
    suggestion.quantity > 0 &&
    isLineFieldEmpty(item, 'quantity')
  ) {
    fields.push('quantity');
  }
  if (suggestion.price > 0 && isLineFieldEmpty(item, 'price')) fields.push('price');
  return fields;
}

export function applyOcrSuggestionToItem(
  item: DocumentOcrLineDraft,
  suggestion: OcrLineSuggestion,
): DocumentOcrLineDraft {
  const next = { ...item };
  if (isLineFieldEmpty(next, 'name') && suggestion.name.trim()) {
    next.name = suggestion.name.trim();
  }
  if (isLineFieldEmpty(next, 'description') && suggestion.description?.trim()) {
    next.description = suggestion.description.trim();
  }
  if (
    suggestion.quantity != null &&
    suggestion.quantity > 0 &&
    isLineFieldEmpty(next, 'quantity')
  ) {
    next.quantity = suggestion.quantity;
  }
  if (suggestion.price > 0 && isLineFieldEmpty(next, 'price')) {
    next.price = suggestion.price;
  }
  return next;
}

export function isBlankLineItem(item: DocumentOcrLineDraft): boolean {
  return (
    !item.name.trim() &&
    !item.description.trim() &&
    item.price === 0 &&
    (item.quantity <= 0 || item.quantity === 1)
  );
}

export function applyAllOcrSuggestions(
  items: DocumentOcrLineDraft[],
  suggestions: OcrLineSuggestion[],
): DocumentOcrLineDraft[] {
  const next = items.map((item) => ({ ...item }));
  let suggestionIndex = 0;

  for (let rowIndex = 0; rowIndex < next.length && suggestionIndex < suggestions.length; rowIndex += 1) {
    const applicable = getApplicableOcrFields(next[rowIndex], suggestions[suggestionIndex]);
    if (applicable.length === 0) continue;
    next[rowIndex] = applyOcrSuggestionToItem(next[rowIndex], suggestions[suggestionIndex]);
    suggestionIndex += 1;
  }

  while (suggestionIndex < suggestions.length) {
    next.push(
      applyOcrSuggestionToItem(
        { name: '', description: '', quantity: 1, price: 0 },
        suggestions[suggestionIndex],
      ),
    );
    suggestionIndex += 1;
  }

  return next.length > 0 ? next : [{ name: '', description: '', quantity: 1, price: 0 }];
}
