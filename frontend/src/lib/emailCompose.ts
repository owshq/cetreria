import { htmlToPlainText, looksLikeHtml } from '@/lib/emailHtml';

export type EmailComposePayload = {
  to: string;
  cc: string;
  subject: string;
  body: string;
};

export function parseEmailList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.includes('@')),
    ),
  ];
}

export function openMailtoCompose(payload: EmailComposePayload): boolean {
  const recipients = parseEmailList(payload.to);
  if (recipients.length === 0) return false;

  const cc = parseEmailList(payload.cc);
  const params = new URLSearchParams();
  params.set('subject', payload.subject);
  params.set('body', looksLikeHtml(payload.body) ? htmlToPlainText(payload.body) : payload.body);
  if (cc.length > 0) params.set('cc', cc.join(','));

  const to = recipients.map(encodeURIComponent).join(',');
  window.location.href = `mailto:${to}?${params.toString()}`;
  return true;
}
