import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import type { Client } from '@shared/types';
import { formatClientCreatedAt, getClientWebsiteHref, getClientWebsiteLabel } from '@shared/types';
import { cx } from '@/lib/cx';
import { CLIENT_STATUS_DOT, CLIENT_STATUS_LABELS } from '@/lib/clientStatus';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';
import StatusDot from '@/components/StatusDot';
import ClientLogo from '@/components/ClientLogo';
import styles from './clientViewCells.module.css';

const statusClass: Record<Client['status'], string> = {
  active: ui.badgeActive,
  inactive: ui.badgeInactive,
  potential: ui.badgePotential,
};

type RenderClientCellArgs = {
  columnId: string;
  client: Client;
  selectedIds: string[];
  isAdmin: boolean;
  toggleSelect: (id: string) => void;
  setStatusMenu: (value: { x: number; y: number; client: Client }) => void;
  setActionMenu: (value: { x: number; y: number; client: Client }) => void;
  actionMenuClientId?: string;
  statusMenuClientId?: string;
};

export function renderClientCell({
  columnId,
  client,
  selectedIds,
  isAdmin,
  toggleSelect,
  setStatusMenu,
  setActionMenu,
  actionMenuClientId,
  statusMenuClientId,
}: RenderClientCellArgs): ReactNode {
  switch (columnId) {
    case 'select':
      return (
        <div className={tableStyles.selectCellInner}>
          <div className={tableStyles.selectCheckboxSlot}>
            <input
              type="checkbox"
              className={tableStyles.rowCheckbox}
              checked={selectedIds.includes(client.id)}
              onChange={() => toggleSelect(client.id)}
              aria-label={`Seleccionar ${client.name}`}
            />
          </div>
          <div className={tableStyles.selectActionsSlot}>
            <div
              className={cx(
                tableStyles.rowActions,
                actionMenuClientId === client.id && tableStyles.rowActionsVisible,
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
                    client,
                  });
                }}
                className={tableStyles.rowActionBtn}
                title="Acciones"
                aria-label={`Acciones de ${client.name}`}
                aria-haspopup="menu"
                aria-expanded={actionMenuClientId === client.id}
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      );
    case 'client':
      return (
        <div className={styles.clientNameCell}>
          {client.logoUrl && <ClientLogo logoUrl={client.logoUrl} size="sm" />}
          <span className={ui.fontMedium}>{client.name}</span>
        </div>
      );
    case 'contact':
      return (
        <>
          <div className={ui.textSmall} title={client.email}>
            {client.email}
          </div>
          <div className={`${ui.textSmall} ${ui.textMuted}`} title={client.phone}>
            {client.phone}
          </div>
        </>
      );
    case 'address':
      return <div className={`${ui.textSmall} ${ui.truncate}`}>{client.address || '—'}</div>;
    case 'website': {
      const href = getClientWebsiteHref(client.website);
      if (!href) {
        return <span className={`${ui.textSmall} ${ui.textMuted}`}>—</span>;
      }
      const label = getClientWebsiteLabel(client.website);
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={ui.tableLink}
          title={label}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open(href, '_blank', 'noopener,noreferrer');
          }}
        >
          {label}
        </a>
      );
    }
    case 'technicalInfo':
      return (
        <div className={`${ui.textSmall} ${ui.truncate}`}>
          {client.technicalInfo.trim() || '—'}
        </div>
      );
    case 'createdAt':
      return (
        <div className={ui.textSmall}>
          {formatClientCreatedAt(client) || '—'}
        </div>
      );
    case 'observations': {
      const count = client.observations.length;
      if (count === 0) {
        return <span className={`${ui.textSmall} ${ui.textMuted}`}>—</span>;
      }
      return (
        <div className={ui.textSmall}>
          {count} {count === 1 ? 'observación' : 'observaciones'}
        </div>
      );
    }
    case 'status': {
      const statusLabel = CLIENT_STATUS_LABELS[client.status];
      const openStatusMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setStatusMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4, client });
      };

      if (isAdmin) {
        return (
          <button
            type="button"
            className={cx(
              statusClass[client.status],
              ui.statusWithDot,
              ui.statusBadge,
              ui.statusBadgeBtn,
            )}
            onClick={openStatusMenu}
            title="Cambiar estado"
            aria-label={`Estado: ${statusLabel}. Clic para cambiar.`}
            aria-haspopup="menu"
            aria-expanded={statusMenuClientId === client.id}
          >
            <StatusDot color={CLIENT_STATUS_DOT[client.status]} />
            {statusLabel}
          </button>
        );
      }

      return (
        <span className={cx(statusClass[client.status], ui.statusWithDot)}>
          <StatusDot color={CLIENT_STATUS_DOT[client.status]} />
          {statusLabel}
        </span>
      );
    }
    default:
      return null;
  }
}

export function renderClientBoardCard(
  client: Client,
  options?: { hideStatus?: boolean },
) {
  const href = getClientWebsiteHref(client.website);
  const createdAtLabel = formatClientCreatedAt(client);

  return (
    <>
      <p className={ui.listPanelItemTitle}>{client.name}</p>
      {createdAtLabel && (
        <p className={ui.listPanelItemMessage}>{createdAtLabel}</p>
      )}
      <p className={ui.listPanelItemMessage}>{client.email}</p>
      {client.phone && <p className={ui.listPanelItemMessage}>{client.phone}</p>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={ui.listPanelItemMessage}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.open(href, '_blank', 'noopener,noreferrer');
          }}
        >
          {getClientWebsiteLabel(client.website)}
        </a>
      )}
      {!options?.hideStatus && (
        <p className={cx(ui.listPanelItemMessage, statusClass[client.status], ui.statusWithDot)}>
          <StatusDot color={CLIENT_STATUS_DOT[client.status]} />
          {CLIENT_STATUS_LABELS[client.status]}
        </p>
      )}
    </>
  );
}
