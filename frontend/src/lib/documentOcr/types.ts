export type OcrLineSuggestion = {
  name: string;
  description?: string;
  quantity?: number;
  price: number;
};

export type DocumentOcrLineField = 'name' | 'description' | 'quantity' | 'price';

export type DocumentOcrLineDraft = {
  name: string;
  description: string;
  quantity: number;
  price: number;
};
