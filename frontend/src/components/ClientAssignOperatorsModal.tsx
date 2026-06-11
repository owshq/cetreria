import { useEffect, useMemo, useState } from 'react';
import type { Activity, CalendarEvent, Client, ClientAssignUsersMode, UserAssignee } from '@shared/types';
import { normalizeClientAssignedUserIds } from '@shared/types';
import { clientsService } from '@/api';
import ClientAssigneesPicker from '@/components/ClientAssigneesPicker';
import { getClientActivityOperatorIds } from '@/lib/clientOperatorFilter';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { Select } from '@/components/forms';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ClientAssignOperatorsModalProps = {
  open: boolean;
  clients: Client[];
  assignees: UserAssignee[];
  activities?: Activity[];
  events?: CalendarEvent[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const MODE_OPTIONS: { value: ClientAssignUsersMode; label: string }[] = [
  { value: 'add', label: 'Anadir operarios' },
  { value: 'set', label: 'Establecer operarios' },
  { value: 'remove', label: 'Quitar operarios' },
];

function resolveInitialSelection(clients: Client[]): string[] {
  if (clients.length !== 1) return [];
  return normalizeClientAssignedUserIds(clients[0]?.assignedUserIds);
}

function resolveInitialMode(clients: Client[]): ClientAssignUsersMode {
  return clients.length === 1 ? 'set' : 'add';
}

export default function ClientAssignOperatorsModal({
  open,
  clients,
  assignees,
  activities = [],
  events = [],
  onClose,
  onSaved,
}: ClientAssignOperatorsModalProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ClientAssignUsersMode>('add');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSingleClient = clients.length === 1;

  const accessViaScheduleUserIds = useMemo(() => {
    if (!isSingleClient) return [];
    const client = clients[0];
    if (!client) return [];
    return getClientActivityOperatorIds(client.id, activities, events);
  }, [isSingleClient, clients, activities, events]);

  useEffect(() => {
    if (!open) return;
    setSelectedUserIds(resolveInitialSelection(clients));
    setMode(resolveInitialMode(clients));
    setError('');
  }, [open, clients]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  usePopupEscape(open, handleClose);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (clients.length === 0) return;

    const effectiveMode = isSingleClient ? 'set' : mode;
    if (selectedUserIds.length === 0 && effectiveMode !== 'set') {
      setError('Selecciona al menos un operario');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await clientsService.bulkAssignUsers({
        clientIds: clients.map((client) => client.id),
        userIds: selectedUserIds,
        mode: effectiveMode,
      });
      await onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron asignar los operarios';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title =
    clients.length === 1
      ? `Operarios de ${clients[0]?.name ?? 'contacto'}`
      : `Operarios de ${clients.length} contactos`;

  return (
    <ModalOverlay>
      <div
        className={cx(ui.modal, ui.modalMd)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-assign-operators-title"
      >
        <ModalHeader
          title={title}
          titleId="client-assign-operators-title"
          onClose={handleClose}
          closeDisabled={saving}
        />
        <form onSubmit={handleSubmit} className={ui.modalForm}>
          <div className={ui.modalScroll}>
            <div className={ui.form}>
              {!isSingleClient ? (
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="client-assign-mode">
                    Accion
                  </label>
                  <Select
                    id="client-assign-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as ClientAssignUsersMode)}
                    disabled={saving}
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div className={ui.field}>
                <span className={ui.label}>Operarios</span>
                <ClientAssigneesPicker
                  assignees={assignees}
                  selectedUserIds={selectedUserIds}
                  accessViaScheduleUserIds={accessViaScheduleUserIds}
                  onChange={setSelectedUserIds}
                  disabled={saving}
                />
              </div>

              {error ? <p className={ui.formError}>{error}</p> : null}
            </div>
          </div>
          <ModalFooter>
            <ModalActions>
              <button
                type="button"
                className={modalBtnSecondary}
                onClick={handleClose}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="submit" className={modalBtnPrimary} disabled={saving || assignees.length === 0}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </ModalActions>
          </ModalFooter>
        </form>
      </div>
    </ModalOverlay>
  );
}
