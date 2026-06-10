import type { OcrLineSuggestion } from './types.js';

const SKIP_LINE =
  /^(total|subtotal|base\s+imponible|iva|igic|irpf|importe|factura|albaran|albarán|n[uú]mero|fecha|cliente|proveedor|cif|nif|direcci[oó]n|tel[eé]fono|email|p[aá]gina|\d+\s*\/\s*\d+$)/i;

const MONEY_AT_END =
  /(?:^|[\s(])(\d{1,3}(?:\.\d{3})*|\d+)[,.](\d{2})\s*(?:|eur)?\s*$/i;

const QTY_BEFORE_PRICE =
  /^(.+?)\s+(\d{1,4}(?:[,.]\d+)?)\s+(\d{1,3}(?:\.\d{3})*|\d+)[,.](\d{2})\s*(?:|eur)?\s*$/i;

function parseMoneyGroups(whole: string, cents: string): number {
  const normalizedWhole = whole.replace(/\./g, '');
  const value = Number.parseFloat(`${normalizedWhole}.${cents}`);
  return Number.isFinite(value) ? value : 0;
}

function parseQuantityToken(token: string): number | undefined {
  const normalized = token.replace(',', '.');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function tryCatalogMatch(line: string, catalogLabels: string[]): string | null {
  const lower = line.toLowerCase();
  for (const label of catalogLabels) {
    const key = label.trim().toLowerCase();
    if (key.length < 8) continue;
    if (lower.includes(key)) return label;
  }
  return null;
}

function extractFromLine(line: string, catalogLabels: string[]): OcrLineSuggestion | null {
  const normalized = normalizeLine(line);
  if (normalized.length < 4 || SKIP_LINE.test(normalized)) return null;

  const catalogHit = tryCatalogMatch(normalized, catalogLabels);
  if (catalogHit) {
    const withoutLabel = normalized.replace(new RegExp(catalogHit, 'i'), '').trim();
    const qtyPrice = QTY_BEFORE_PRICE.exec(withoutLabel);
    if (qtyPrice) {
      return {
        name: catalogHit,
        quantity: parseQuantityToken(qtyPrice[2]),
        price: parseMoneyGroups(qtyPrice[3], qtyPrice[4]),
      };
    }
    const money = MONEY_AT_END.exec(withoutLabel);
    if (money) {
      return {
        name: catalogHit,
        price: parseMoneyGroups(money[1], money[2]),
      };
    }
    if (!withoutLabel || withoutLabel.length < 3) {
      return { name: catalogHit, price: 0 };
    }
  }

  const qtyPrice = QTY_BEFORE_PRICE.exec(normalized);
  if (qtyPrice) {
    const name = qtyPrice[1].trim();
    if (name.length < 2) return null;
    return {
      name,
      quantity: parseQuantityToken(qtyPrice[2]),
      price: parseMoneyGroups(qtyPrice[3], qtyPrice[4]),
    };
  }

  const money = MONEY_AT_END.exec(normalized);
  if (!money) return null;

  const name = normalized.slice(0, money.index).replace(/[\s(]+$/, '').trim();
  if (name.length < 2) return null;

  return {
    name,
    price: parseMoneyGroups(money[1], money[2]),
  };
}

function dedupeSuggestions(items: OcrLineSuggestion[]): OcrLineSuggestion[] {
  const seen = new Set<string>();
  const result: OcrLineSuggestion[] = [];
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.price}|${item.quantity ?? 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function parseLineItemsFromOcrText(
  text: string,
  catalogLabels: string[] = [],
): OcrLineSuggestion[] {
  const sortedCatalog = [...catalogLabels]
    .filter((label) => label.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length > 0);

  const suggestions: OcrLineSuggestion[] = [];
  for (const line of lines) {
    const parsed = extractFromLine(line, sortedCatalog);
    if (!parsed || parsed.price <= 0) continue;
    suggestions.push(parsed);
  }

  return dedupeSuggestions(suggestions).slice(0, 24);
}
