const HTML_TAG_RE = /<[a-z][\s\S]*>/i;

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainTextToHtml(text: string): string {
  if (!text.trim()) return '<p><br></p>';
  if (looksLikeHtml(text)) return text;
  return text
    .split('\n')
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
}

export function htmlToPlainText(html: string): string {
  if (!html.trim()) return '';
  if (!looksLikeHtml(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}

export function wrapEmailHtmlDocument(bodyHtml: string): string {
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="UTF-8"></head>',
    '<body style="margin:0;padding:0;font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#323130;">',
    bodyHtml,
    '</body></html>',
  ].join('');
}
