import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { usePopupEscape } from '@/context/PopupStackContext';
import { Plus, X } from 'lucide-react';
import { SidebarNavIcon, type SidebarNavIconName } from '@/components/icons/SidebarNavIcons';
import { cx } from '@/lib/cx';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import { SidebarFooterAction } from '@/components/SidebarFooter';
import ui from '@/styles/shared.module.css';
import styles from './QuickCreateModal.module.css';

type QuickCreateModalProps = {
  onNewActivity: () => void;
  isAdmin: boolean;
  triggerClassName?: string;
  compactTrigger?: boolean;
  /** Botón en toolbar de tabla (Inicio, listados, etc.). */
  toolbarTrigger?: boolean;
};

type QuickAction = {
  id: string;
  label: string;
  description: string;
  icon: SidebarNavIconName;
  adminOnly?: boolean;
  onSelect: () => void;
};

export default function QuickCreateModal({
  onNewActivity,
  isAdmin,
  triggerClassName,
  compactTrigger = false,
  toolbarTrigger = false,
}: QuickCreateModalProps) {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  usePopupEscape(open, close);

  const actions: QuickAction[] = [
    {
      id: 'activity',
      label: 'Actividad',
      description: 'Registrar trabajo',
      icon: 'schedule',
      onSelect: () => {
        close();
        onNewActivity();
      },
    },
    {
      id: 'client',
      label: 'Contacto',
      description: 'Añadir contacto',
      icon: 'people',
      adminOnly: true,
      onSelect: () => {
        close();
        navigate('/clients?new=1');
      },
    },
    {
      id: 'document',
      label: 'Documento',
      description: 'Factura o albarán',
      icon: 'folder',
      onSelect: () => {
        close();
        navigate('/docs?new=1');
      },
    },
    {
      id: 'user',
      label: 'Usuario',
      description: 'Nueva cuenta',
      icon: 'settings',
      adminOnly: true,
      onSelect: () => {
        close();
        navigate('/settings?tab=users&new=1');
      },
    },
  ];

  const visibleActions = actions.filter((action) => !action.adminOnly || isAdmin);

  useEffect(() => {
    if (!open || !isDesktop) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, isDesktop]);

  useEffect(() => {
    setOpen(false);
  }, [isDesktop]);

  const iconSize = toolbarTrigger ? 16 : 14;
  const iconStroke = toolbarTrigger ? 2 : 2.25;
  const showDesktopActions = open && isDesktop;

  const renderAction = (action: QuickAction) => (
    <button
      key={action.id}
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={action.onSelect}
    >
      <span className={styles.iconBox} aria-hidden>
        <SidebarNavIcon name={action.icon} active className={styles.menuIcon} />
      </span>
      <span className={styles.menuItemText}>
        <span className={styles.menuItemLabel}>{action.label}</span>
        <span className={styles.menuItemDescription}>{action.description}</span>
      </span>
    </button>
  );

  const renderExpandedAction = (action: QuickAction) => (
    <button
      key={action.id}
      type="button"
      className={cx(
        styles.actionBtn,
        toolbarTrigger && styles.actionBtnToolbar,
        compactTrigger && styles.actionBtnCompact,
      )}
      onClick={action.onSelect}
      aria-label={`${action.label}: ${action.description}`}
    >
      <Plus
        size={iconSize}
        strokeWidth={iconStroke}
        className={styles.actionPlus}
        aria-hidden
      />
      <SidebarNavIcon
        name={action.icon}
        className={styles.actionIcon}
        aria-hidden
      />
      <span className={styles.actionTooltip} role="tooltip">
        <span className={styles.actionTooltipLabel}>{action.label}</span>
        <span className={styles.actionTooltipDescription}>{action.description}</span>
      </span>
    </button>
  );

  return (
    <div ref={rootRef} className={styles.root}>
      {!showDesktopActions && (
        <SidebarFooterAction
          onClick={() => setOpen(true)}
          compact={compactTrigger}
          mobileIconOnly={toolbarTrigger ? false : !isDesktop}
          label="Crear"
          labelClassName={toolbarTrigger ? ui.toolbarBtnLabel : undefined}
          className={cx(
            styles.trigger,
            toolbarTrigger && styles.triggerToolbar,
            triggerClassName,
          )}
          aria-label="Crear"
          title="Crear"
          aria-haspopup={isDesktop ? 'menu' : 'dialog'}
          aria-expanded={open}
        >
          <Plus size={iconSize} strokeWidth={iconStroke} />
        </SidebarFooterAction>
      )}

      {showDesktopActions && (
        <div className={styles.actionsRow} role="group" aria-label="Crear">
          {visibleActions.map(renderExpandedAction)}
        </div>
      )}

      {open && !isDesktop && (
        <ModalOverlay onClick={close}>
          <div
            className={cx(ui.modal, styles.modal)}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-create-title"
          >
            <ModalHeader
              title="Selecciona qué quieres crear"
              titleId="quick-create-title"
              onClose={close}
            />
            <div className={cx(ui.modalScroll, styles.body)}>
              <div className={styles.list} role="menu" aria-label="Crear">
                {visibleActions.map(renderAction)}
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
