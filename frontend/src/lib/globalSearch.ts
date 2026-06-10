import type { Activity, ActivityType, Client, Document } from '@shared/types';
import { DOCUMENT_TYPE_LABELS, getActivityTypeLabel } from '@shared/types';

export type GlobalSearchResultType = 'client' | 'activity' | 'document';

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  documentId?: string;
};

const RESULTS_PER_GROUP = 6;

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function matchesTerm(haystack: string, term: string): boolean {
  return normalize(haystack).includes(term);
}

function buildClientResults(clients: Client[], term: string): GlobalSearchResult[] {
  return clients
    .filter((client) => {
      const observationText = (client.observations ?? [])
        .map((item) => `${item.text} ${item.authorName ?? ''}`)
        .join(' ');
      return (
        matchesTerm(client.name, term) ||
        matchesTerm(client.email, term) ||
        client.phone.includes(term.trim()) ||
        matchesTerm(client.address, term) ||
        matchesTerm(client.website, term) ||
        matchesTerm(client.technicalInfo, term) ||
        matchesTerm(observationText, term)
      );
    })
    .slice(0, RESULTS_PER_GROUP)
    .map((client) => ({
      id: client.id,
      type: 'client' as const,
      title: client.name,
      subtitle: client.email || client.phone || 'Contacto',
      badge: 'Contacto',
      href: `/clients/${client.id}`,
    }));
}

function buildActivityResults(
  activities: Activity[],
  clientsById: Map<string, Client>,
  activityTypes: ActivityType[],
  term: string,
): GlobalSearchResult[] {
  return activities
    .filter((activity) => {
      const clientName = clientsById.get(activity.clientId)?.name ?? '';
      const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
      return (
        matchesTerm(activity.description, term) ||
        matchesTerm(typeLabel, term) ||
        matchesTerm(clientName, term)
      );
    })
    .slice(0, RESULTS_PER_GROUP)
    .map((activity) => {
      const clientName = clientsById.get(activity.clientId)?.name ?? 'Sin contacto';
      const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
      return {
        id: activity.id,
        type: 'activity' as const,
        title: activity.description.trim() || typeLabel,
        subtitle: `${clientName} \u00b7 ${typeLabel}`,
        badge: 'Actividad',
        href: `/activities/${activity.id}`,
      };
    });
}

function buildDocumentResults(
  documents: Document[],
  clientsById: Map<string, Client>,
  term: string,
): GlobalSearchResult[] {
  return documents
    .filter((doc) => {
      const clientName = clientsById.get(doc.clientId)?.name ?? '';
      const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
      const itemsText = doc.items
        .map((item) => `${item.name} ${item.description}`)
        .join(' ');
      return (
        matchesTerm(doc.number, term) ||
        matchesTerm(clientName, term) ||
        matchesTerm(typeLabel, term) ||
        matchesTerm(itemsText, term)
      );
    })
    .slice(0, RESULTS_PER_GROUP)
    .map((doc) => {
      const clientName = clientsById.get(doc.clientId)?.name ?? 'Sin contacto';
      const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
      return {
        id: doc.id,
        type: 'document' as const,
        title: doc.number,
        subtitle: `${typeLabel} \u00b7 ${clientName}`,
        badge: 'Documento',
        href: '/docs',
        documentId: doc.id,
      };
    });
}

export function searchGlobal(
  term: string,
  data: {
    clients: Client[];
    activities: Activity[];
    documents: Document[];
    activityTypes: ActivityType[];
  },
): GlobalSearchResult[] {
  const normalized = normalize(term);
  if (!normalized) return [];

  const clientsById = new Map(data.clients.map((client) => [client.id, client]));

  return [
    ...buildClientResults(data.clients, normalized),
    ...buildActivityResults(data.activities, clientsById, data.activityTypes, normalized),
    ...buildDocumentResults(data.documents, clientsById, normalized),
  ];
}

export const GLOBAL_SEARCH_GROUP_LABELS: Record<GlobalSearchResultType, string> = {
  client: 'Contactos',
  activity: 'Actividades',
  document: 'Documentos',
};
