import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, subMonths } from 'date-fns';
import { useSearchParams } from 'react-router';
import { useCloseAllPopups, usePopupEscape } from '@/context/PopupStackContext';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import UserScheduleEditor, {
  ScheduleHolidayModeToolbarButton,
  ScheduleShiftLegend,
} from '@/components/UserScheduleEditor';
import { formatSchedulePeriodLabel } from '@/lib/schedulePeriod';
import calendarStyles from './Calendar.module.css';
import { usersService, authService } from '@/api';
import type { User } from '@shared/types';
import {
  DEFAULT_USER_ROLE_LABEL,
  getUserRoleLabel,
  normalizeMaxVacationDays,
} from '@shared/types';
import { cx } from '@/lib/cx';
import { Input, SearchField, Select } from '@/components/forms';
import ConfigurableTable from '@/components/ConfigurableTable';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import ContentLoading from '@/components/ContentLoading';
import EmptyState from '@/components/EmptyState';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { useTableView } from '@/hooks/useTableView';
import {
  resolveTableDataCellClassName,
  resolveTableDataCellStyle,
} from '@/lib/tableColumnLayout';
import {
  USER_DISPLAY_COLUMNS,
  USER_TABLE_VIEW_COLUMNS,
  USERS_VIEW_PAGE_KEY,
} from '@/lib/userTableView';
import { matchesTableSearch } from '@/lib/tableViews';
import { renderUserCell } from '@/lib/userViewCells';
import ui from '@/styles/shared.module.css';
import ConfirmDialog from '@/components/ConfirmDialog';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import styles from './Users.module.css';

type UsersManagementProps = {
  secondaryNavCollapsed?: boolean;
  onToggleSecondaryNav?: () => void;
};

export default function UsersManagement({
  secondaryNavCollapsed = false,
  onToggleSecondaryNav,
}: UsersManagementProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<Omit<User, 'password'>[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [scheduleUser, setScheduleUser] = useState<Omit<User, 'password'> | null>(null);
  const [scheduleModalDate, setScheduleModalDate] = useState(new Date());
  const [scheduleHolidayMode, setScheduleHolidayMode] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState('');
  const roleEditCancelledRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [revealedPasswordUserIds, setRevealedPasswordUserIds] = useState<Set<string>>(() => new Set());
  const [passwordOverrides, setPasswordOverrides] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Omit<User, 'password'> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentUser = authService.getCurrentUser();
  const closeAllPopups = useCloseAllPopups();

  const { config, buildRows, updateColumnLayout } = useTableView(
    USERS_VIEW_PAGE_KEY,
    USER_DISPLAY_COLUMNS,
    USER_TABLE_VIEW_COLUMNS,
    undefined,
    'name',
  );

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user' as User['role'],
    roleLabel: DEFAULT_USER_ROLE_LABEL,
    password: '',
    maxVacationDays: 0,
  });

  const loadUsers = async () => {
    setUsers(await usersService.getAll());
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'user',
      roleLabel: DEFAULT_USER_ROLE_LABEL,
      password: '',
      maxVacationDays: 0,
    });
  };

  const closeUserModal = () => {
    setShowModal(false);
    setEditingUser(null);
    resetForm();
  };

  usePopupEscape(showModal, closeUserModal);

  const closeScheduleModal = () => {
    setScheduleUser(null);
    setScheduleModalDate(new Date());
    setScheduleHolidayMode(false);
  };

  const scheduleModalPeriodLabel = useMemo(
    () => formatSchedulePeriodLabel(scheduleModalDate),
    [scheduleModalDate],
  );

  const handleScheduleModalPeriodChange = useCallback((date: Date) => {
    setScheduleModalDate(date);
  }, []);
  usePopupEscape(scheduleUser !== null, closeScheduleModal);

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      setLoading(false);
      return;
    }
    loadUsers().finally(() => setLoading(false));
  }, [currentUser?.role]);

  useEffect(() => {
    if (searchParams.get('new') !== '1' || currentUser?.role !== 'admin') return;
    setSearchParams({}, { replace: true });
    resetForm();
    setEditingUser(null);
    setShowModal(true);
  }, [searchParams, setSearchParams, currentUser?.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      const updates: Partial<User> = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
      };
      if (formData.role === 'user') {
        updates.roleLabel = formData.roleLabel.trim() || DEFAULT_USER_ROLE_LABEL;
      }
      if (formData.password) updates.password = formData.password;
      updates.maxVacationDays = normalizeMaxVacationDays(formData.maxVacationDays);
      const updated = await usersService.update(editingUser, updates);
      if (updated.id === currentUser?.id) {
        authService.syncSessionUser(updated);
      }
      if (formData.password) {
        setPasswordOverrides((current) => ({ ...current, [editingUser]: formData.password }));
      }
    } else {
      const created = await usersService.create({
        ...formData,
        maxVacationDays: normalizeMaxVacationDays(formData.maxVacationDays),
        roleLabel:
          formData.role === 'user'
            ? formData.roleLabel.trim() || DEFAULT_USER_ROLE_LABEL
            : undefined,
      });
      setPasswordOverrides((current) => ({ ...current, [created.id]: formData.password }));
    }

    await loadUsers();
    closeAllPopups();
    setShowModal(false);
    setEditingUser(null);
    resetForm();
  };

  const handleEdit = (user: Omit<User, 'password'>) => {
    setEditingUser(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: user.roleLabel?.trim() || DEFAULT_USER_ROLE_LABEL,
      password: '',
      maxVacationDays: normalizeMaxVacationDays(user.maxVacationDays),
    });
    setShowModal(true);
  };

  const handleRoleLabelBlur = async (user: Omit<User, 'password'>, value: string) => {
    if (user.role === 'admin') return;

    const next = value.trim() || DEFAULT_USER_ROLE_LABEL;
    const current = user.roleLabel?.trim() || DEFAULT_USER_ROLE_LABEL;
    if (next === current) return;

    const updated = await usersService.update(user.id, { roleLabel: next });
    if (updated.id === currentUser?.id) {
      authService.syncSessionUser(updated);
    }
    await loadUsers();
  };

  const startRoleEdit = (user: Omit<User, 'password'>) => {
    setEditingRoleId(user.id);
    setRoleDraft(getUserRoleLabel(user));
  };

  const finishRoleEdit = async (user: Omit<User, 'password'>) => {
    setEditingRoleId(null);
    await handleRoleLabelBlur(user, roleDraft);
  };

  const cancelRoleEdit = () => {
    setEditingRoleId(null);
  };

  const handleRoleChange = (role: User['role']) => {
    setFormData((current) => ({
      ...current,
      role,
      roleLabel:
        role === 'user' ? current.roleLabel.trim() || DEFAULT_USER_ROLE_LABEL : DEFAULT_USER_ROLE_LABEL,
    }));
  };

  const searchedUsers = useMemo(
    () =>
      users.filter((user) =>
        matchesTableSearch(user, searchTerm, USER_TABLE_VIEW_COLUMNS, undefined),
      ),
    [users, searchTerm],
  );

  const tableRows = buildRows(searchedUsers);

  const {
    visibleItems: visibleRows,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(tableRows, [searchTerm, config]);

  const handleDelete = (id: string) => {
    if (id === currentUser?.id) {
      alert('No puedes eliminar tu propio usuario');
      return;
    }
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setDeleteConfirm(user);
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await usersService.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      await loadUsers();
    } catch {
      alert('No se pudo eliminar el usuario.');
    } finally {
      setDeleting(false);
    }
  };

  if (currentUser?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <ContentLoading className={styles.usersContentLoading} />
    );
  }

  const togglePasswordVisibility = (userId: string) => {
    setRevealedPasswordUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const cellArgs = {
    currentUserId: currentUser?.id,
    editingRoleId,
    roleDraft,
    onRoleDraftChange: setRoleDraft,
    onStartRoleEdit: startRoleEdit,
    onFinishRoleEdit: finishRoleEdit,
    onCancelRoleEdit: cancelRoleEdit,
    roleEditCancelledRef,
    onEdit: handleEdit,
    onOpenSchedule: setScheduleUser,
    onDelete: handleDelete,
    passwordOverrides,
    revealedPasswordUserIds,
    onTogglePasswordVisibility: togglePasswordVisibility,
  };

  return (
    <>
      <div className={styles.usersContent}>
        <div className={ui.tablePage}>
          <div className={styles.usersToolbarStack}>
            <div className={cx(ui.tableToolbar, styles.usersTableToolbar)}>
              <div className={ui.filtersRow}>
                {secondaryNavCollapsed && onToggleSecondaryNav ? (
                  <SecondaryNavToggle
                    expanded={false}
                    onToggle={onToggleSecondaryNav}
                    controlsId="settings-secondary-nav"
                    className={styles.secondaryNavExpandBtn}
                  />
                ) : null}
                <SearchField
                  wrapperClassName={ui.searchWrapper}
                  placeholder="Buscar por nombre, email o rol..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setEditingUser(null);
                    setShowModal(true);
                  }}
                  className={cx(ui.toolbarBtnPrimary, ui.toolbarEnd)}
                  aria-label="Nuevo usuario"
                  title="Nuevo usuario"
                >
                  <Plus size={16} />
                  <span className={ui.toolbarBtnLabel}>Usuario</span>
                </button>
              </div>
            </div>
          </div>

          <div className={cx(ui.tableBody, styles.usersTableBody)}>
            <ConfigurableTable
              displayColumns={USER_DISPLAY_COLUMNS}
              config={config}
              onConfigChange={updateColumnLayout}
            >
              {(visibleColumns) =>
                tableRows.length > 0 ? (
                  visibleRows.map((row) => {
                    if (row.kind === 'group') {
                      return (
                        <tr key={`group-${row.key}`} className={ui.tableGroupRow}>
                          <td colSpan={visibleColumns.length} className={ui.tableGroupCell}>
                            <div className={ui.tableGroupCellInner}>
                              {row.label}
                              <span className={ui.textMuted}> ({row.count})</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    const user = row.item;
                    return (
                      <tr key={user.id} className={ui.tableRow}>
                        {visibleColumns.map((column, columnIndex) => (
                          <td
                            key={column.id}
                            className={resolveTableDataCellClassName(
                              column,
                              columnIndex,
                              visibleColumns,
                              config,
                            )}
                            style={resolveTableDataCellStyle(column, visibleColumns, config)}
                          >
                            {renderUserCell({
                              columnId: column.id,
                              user,
                              ...cellArgs,
                            })}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={visibleColumns.length} className={ui.emptyCell}>
                      <EmptyState
                        emoji="🧑‍💼"
                        description="No hay usuarios que coincidan con la búsqueda."
                        compact
                      />
                    </td>
                  </tr>
                )
              }
            </ConfigurableTable>
            <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
          </div>
        </div>
      </div>

      {scheduleUser && (
        <ModalOverlay>
          <div className={`${ui.modal} ${ui.modalLg}`}>
            <ModalHeader
              title={`Horario — ${scheduleUser.name}`}
              onClose={closeScheduleModal}
            />
            <div className={ui.modalScroll}>
              <div className={styles.scheduleModalToolbar}>
                <div className={calendarStyles.periodTitleNav}>
                  <button
                    type="button"
                    className={ui.btnIcon}
                    aria-label="Anterior"
                    onClick={() => setScheduleModalDate(subMonths(scheduleModalDate, 1))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={styles.scheduleModalPeriod}>{scheduleModalPeriodLabel}</span>
                  <button
                    type="button"
                    className={ui.btnIcon}
                    aria-label="Siguiente"
                    onClick={() => setScheduleModalDate(addMonths(scheduleModalDate, 1))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className={styles.scheduleModalToolbarActions}>
                  <ScheduleShiftLegend compact className={styles.scheduleModalToolbarLegend} />
                  <ScheduleHolidayModeToolbarButton
                    active={scheduleHolidayMode}
                    onToggle={() => setScheduleHolidayMode((value) => !value)}
                  />
                </div>
              </div>
              <UserScheduleEditor
                userId={scheduleUser.id}
                userName={scheduleUser.name}
                embedded
                toolbarControlled
                currentDate={scheduleModalDate}
                onPeriodChange={handleScheduleModalPeriodChange}
                maxVacationDays={scheduleUser.maxVacationDays}
                isAdmin
                holidayMode={scheduleHolidayMode}
                onHolidayModeChange={setScheduleHolidayMode}
              />
            </div>
            <ModalFooter>
              <ModalActions>
                <button type="button" onClick={closeScheduleModal} className={modalBtnSecondary}>
                  Cerrar
                </button>
              </ModalActions>
            </ModalFooter>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Eliminar usuario"
        message={
          deleteConfirm
            ? `¿Eliminar a ${deleteConfirm.name}? Esta acción no se puede deshacer.`
            : ''
        }
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
      />

      {showModal && (
        <ModalOverlay>
          <div className={`${ui.modal} ${ui.modalMd}`}>
            <ModalHeader
              title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              onClose={() => {
                setShowModal(false);
                setEditingUser(null);
                resetForm();
              }}
            />
            <form onSubmit={handleSubmit} className={ui.modalForm}>
              <div className={ui.modalScroll}>
              <div className={ui.form}>
                <div className={ui.field}>
                  <label className={ui.label}>Nombre completo *</label>
                  <Input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className={ui.field}>
                  <label className={ui.label}>Email *</label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                </div>
                <div className={ui.field}>
                  <label className={ui.label}>Contraseña {editingUser && '(dejar vacío para mantener)'}</label>
                  <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={!editingUser} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label}>Tipo de cuenta *</label>
                  <Select
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value as User['role'])}
                  >
                    <option value="user">Usuario</option>
                    <option value="admin">Administrador</option>
                  </Select>
                </div>
                {formData.role === 'user' && (
                  <div className={ui.field}>
                    <label className={ui.label}>Nombre del rol</label>
                    <Input
                      type="text"
                      value={formData.roleLabel}
                      onChange={(e) => setFormData({ ...formData, roleLabel: e.target.value })}
                      placeholder={DEFAULT_USER_ROLE_LABEL}
                    />
                  </div>
                )}
                <div className={ui.field}>
                  <label className={ui.label}>Días máx. de vacaciones al año</label>
                  <Input
                    type="number"
                    min={0}
                    max={366}
                    value={formData.maxVacationDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxVacationDays: normalizeMaxVacationDays(e.target.value),
                      })
                    }
                  />
                  <span className={styles.fieldNote}>0 = no puede marcar vacaciones en el calendario.</span>
                </div>
              </div>
              </div>
              <ModalFooter>
                <ModalActions>
                  <button type="submit" className={modalBtnPrimary}>
                    {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                  </button>
                  <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); resetForm(); }} className={modalBtnSecondary}>
                    Cancelar
                  </button>
                </ModalActions>
              </ModalFooter>
            </form>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
