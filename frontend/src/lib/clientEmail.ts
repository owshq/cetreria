import type { Client } from '@shared/types';
import { openMailtoCompose, type EmailComposePayload } from '@/lib/emailCompose';

function normalizeEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) return null;
  return trimmed;
}

function formatContactLine(client: Client): string {
  const email = normalizeEmail(client.email);
  const parts = [client.name];
  if (email) parts.push(`<${email}>`);
  const phone = client.phone.trim();
  if (phone) parts.push(phone);
  return `- ${parts.join(' · ')}`;
}

export function buildClientsEmailDefaults(clients: Client[]) {
  const recipients = [
    ...new Set(
      clients
        .map((client) => normalizeEmail(client.email))
        .filter((email): email is string => email !== null),
    ),
  ];

  return {
    to: recipients.join(', '),
    subject:
      clients.length === 1 ? `Contacto: ${clients[0].name}` : `${clients.length} contactos`,
    body: `Contactos seleccionados:\n\n${clients.map(formatContactLine).join('\n')}\n`,
  };
}

/** Abre el cliente de correo del sistema con los contactos seleccionados. */
export function openClientsBulkEmail(clients: Client[], compose?: EmailComposePayload): boolean {
  if (clients.length === 0) return false;

  const defaults = buildClientsEmailDefaults(clients);
  if (!defaults.to && !compose?.to.trim()) {
    alert('Ninguno de los contactos seleccionados tiene un email valido.');
    return false;
  }

  const payload: EmailComposePayload = {
    to: compose?.to ?? defaults.to,
    cc: compose?.cc ?? '',
    subject: compose?.subject ?? defaults.subject,
    body: compose?.body ?? defaults.body,
  };

  if (!openMailtoCompose(payload)) {
    alert('Indica al menos un destinatario valido en Para.');
    return false;
  }

  return true;
}
