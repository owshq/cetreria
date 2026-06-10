import type { ReactNode } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import type { Activity, Client, Document, WorkspaceBillingSettings } from '@shared/types';
import {
  VERIFACTU_INVOICE_KIND_LABELS,
  resolveVerifactuInvoiceKind,
  resolveVerifactuStatus,
} from '@shared/types';
import { DOCUMENT_FORMAT_EMOJI, DOCUMENT_TYPE_LABELS, getDocumentFormatKey, getDocumentFormatLabel } from '@shared/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cx } from '@/lib/cx';
import { DOCUMENT_STATUS_LABELS } from '@/lib/documentStatus';
import DocumentStatusBadge from '@/components/DocumentStatusBadge';
import VerifactuStatusBadge from '@/components/VerifactuStatusBadge';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';

type RenderDocumentCellArgs = {
  columnId: string;
  doc: Document;
  clientsMap: Map<string, Client>;
  activitiesMap: Map<string, Activity>;
  selectedIds: string[];
  isAdmin: boolean;
  toggleSelect: (id: string) => void;
  setStatusMenu: (value: { x: number; y: number; doc: Document }) => void;
  setActionMenu: (value: { x: number; y: number; doc: Document }) => void;
  setActivityLinkMenu: (value: { x: number; y: number; doc: Document }) => void;
  actionMenuDocId?: string;
  statusMenuDocId?: string;
  activityLinkMenuDocId?: string;
  billingSettings?: WorkspaceBillingSettings | null;
};

export function renderDocumentCell({
  columnId,
  doc,
  clientsMap,
  activitiesMap,
  selectedIds,
  isAdmin,
  toggleSelect,
  setStatusMenu,
  setActionMenu,
  setActivityLinkMenu,
  actionMenuDocId,
  statusMenuDocId,
  activityLinkMenuDocId,
  billingSettings,
}: RenderDocumentCellArgs): ReactNode {
  switch (columnId) {
    case 'select':
      return (
        <div className={tableStyles.selectCellInner}>
          <div className={tableStyles.selectCheckboxSlot}>
            <input
              type="checkbox"
              className={tableStyles.rowCheckbox}
              checked={selectedIds.includes(doc.id)}
              onChange={() => toggleSelect(doc.id)}
              aria-label={`Seleccionar ${doc.number}`}
            />
          </div>
          <div className={tableStyles.selectActionsSlot}>
            <div
              className={cx(
                tableStyles.rowActions,
                actionMenuDocId === doc.id && tableStyles.rowActionsVisible,
              )}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setActionMenu({
                    x: rect.right,
                    y: rect.bottom + 4,
                    doc,
                  });
                }}
                className={tableStyles.rowActionBtn}
                title="Acciones"
                aria-label={`Acciones de ${doc.number}`}
                aria-haspopup="menu"
                aria-expanded={actionMenuDocId === doc.id}
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      );
    case 'number':
      return <div className={ui.fontMedium}>{doc.number}</div>;
    case 'type':
      return <div className={ui.textSmall}>{DOCUMENT_TYPE_LABELS[doc.type]}</div>;
    case 'format': {
      const formatKey = getDocumentFormatKey(doc);
      return (
        <div className={ui.textSmall}>
          <span aria-hidden>{DOCUMENT_FORMAT_EMOJI[formatKey]} </span>
          {getDocumentFormatLabel(doc)}
        </div>
      );
    }
    case 'client':
      return <div className={ui.textSmall}>{clientsMap.get(doc.clientId)?.name}</div>;
    case 'date':
      return (
        <div className={ui.textSmall}>
          {format(parseISO(doc.date), 'd MMM yyyy', { locale: es })}
        </div>
      );
    case 'total':
      return <div className={ui.fontMedium}>{doc.total.toFixed(2)}€</div>;
    case 'activity': {
      const linkedActivity =
        doc.activityId && activitiesMap.has(doc.activityId)
          ? activitiesMap.get(doc.activityId)!
          : null;

      if (linkedActivity) {
        return (
          <div className={ui.textSmall}>
            {format(parseISO(linkedActivity.date), 'd MMM yyyy', { locale: es })}
          </div>
        );
      }

      return (
        <button
          type="button"
          className={tableStyles.cellAddBtn}
          title="Vincular o crear actividad"
          aria-label={`Vincular actividad a ${doc.number}`}
          aria-haspopup="menu"
          aria-expanded={activityLinkMenuDocId === doc.id}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setActivityLinkMenu({
              x: rect.left + rect.width / 2,
              y: rect.bottom + 4,
              doc,
            });
          }}
        >
          <Plus size={14} strokeWidth={2} aria-hidden />
        </button>
      );
    }
    case 'status': {
      const statusLabel = DOCUMENT_STATUS_LABELS[doc.status];
      const openStatusMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setStatusMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4, doc });
      };

      if (isAdmin) {
        return (
          <DocumentStatusBadge
            as="button"
            status={doc.status}
            onClick={openStatusMenu}
            title="Cambiar estado"
            aria-label={`Estado: ${statusLabel}. Clic para cambiar.`}
            aria-haspopup="menu"
            aria-expanded={statusMenuDocId === doc.id}
          />
        );
      }

      return <DocumentStatusBadge status={doc.status} />;
    }
    case 'verifactuStatus': {
      const status = resolveVerifactuStatus(doc, billingSettings);
      if (!status) {
        return <div className={ui.textSmall}>—</div>;
      }
      return <VerifactuStatusBadge status={status} />;
    }
    case 'invoiceKind': {
      if (doc.type !== 'invoice') {
        return <div className={ui.textSmall}>—</div>;
      }
      const kind = resolveVerifactuInvoiceKind(doc);
      return <div className={ui.textSmall}>{VERIFACTU_INVOICE_KIND_LABELS[kind]}</div>;
    }
    default:
      return null;
  }
}

export function renderDocumentBoardCard(
  doc: Document,
  clientsMap: Map<string, Client>,
) {
  return (
    <>
      <p className={ui.listPanelItemTitle}>{doc.number}</p>
      <p className={ui.listPanelItemMessage}>{clientsMap.get(doc.clientId)?.name}</p>
      <p className={ui.listPanelItemMessage}>
        {format(parseISO(doc.date), 'd MMM yyyy', { locale: es })}
      </p>
      <p className={ui.listPanelItemMessage}>
        {DOCUMENT_TYPE_LABELS[doc.type]} · {doc.total.toFixed(2)}€
      </p>
    </>
  );
}
