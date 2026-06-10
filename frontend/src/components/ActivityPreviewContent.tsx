import { Plus } from 'lucide-react';
import type { ActivityType, Client, Document } from '@shared/types';
import {
  activityTypeUsesWorkReport,
  DOCUMENT_TYPE_LABELS,
  resolveActivityType,
} from '@shared/types';
import { openDocumentPdf, openDocumentPdfLocally } from '@/lib/documentPdf';
import ActivityAssigneeAvatars from '@/components/ActivityAssigneeAvatars';
import ActivityTypeBadge from '@/components/ActivityTypeBadge';
import { cx } from '@/lib/cx';
import {
  formatActivityPreviewSignatureLabel,
  formatActivityPreviewSignatureTitle,
  formatActivityPreviewWorkReportLabel,
  formatActivityPreviewWorkReportTitle,
  type ActivityPreviewMeta,
} from '@/lib/activityPreview';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import ui from '@/styles/shared.module.css';
import styles from './ActivityPreviewContent.module.css';

type ActivityPreviewContentProps = {
  meta: ActivityPreviewMeta;
  activityTypes: ActivityType[];
  variant?: 'default' | 'nav' | 'day';
  clientsMap?: Map<string, Client>;
  onAssociateDocument?: () => void;
  /** Muestra accion para crear/vincular albaran aunque ya haya otros documentos. */
  showAssociateDocument?: boolean;
  associateDocumentLabel?: string;
  canSignHours?: boolean;
  onSignHours?: () => void;
  /** Solo en variante nav: abre edición para asignar operarios. */
  onEditAssignees?: () => void;
};

export default function ActivityPreviewContent({
  meta,
  activityTypes,
  variant = 'default',
  clientsMap,
  onAssociateDocument,
  showAssociateDocument = false,
  associateDocumentLabel = 'Asociar documento',
  canSignHours = false,
  onSignHours,
  onEditAssignees,
}: ActivityPreviewContentProps) {
  const { workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const typeUsesWorkReport = meta.typeRef
    ? activityTypeUsesWorkReport(resolveActivityType(meta.typeRef, activityTypes))
    : false;
  const {
    clientName,
    description,
    metaPrimary,
    metaDetails,
    assignedUsers,
    assigneeSlots,
    typeRef,
    linkedDocuments,
    activityId,
    visibleAssignees,
    hiddenAssigneeCount,
    signatureSummary,
    workReportSummary,
  } = meta;

  const showDocumentList = linkedDocuments.length > 0;
  const canAssociateInline =
    variant !== 'nav' &&
    Boolean(
      onAssociateDocument &&
        activityId &&
        (showAssociateDocument || linkedDocuments.length === 0),
    );
  const canSignInline =
    workerSignaturesEnabled &&
    !typeUsesWorkReport &&
    variant !== 'nav' &&
    canSignHours &&
    onSignHours != null;

  const associateButton = canAssociateInline ? (
    <button
      type="button"
      className={cx(ui.btnPrimary, styles.associateBtn)}
      onClick={(event) => {
        event.stopPropagation();
        onAssociateDocument?.();
      }}
    >
      {associateDocumentLabel}
    </button>
  ) : null;

  const signButton = canSignInline ? (
    <button
      type="button"
      className={styles.signBtn}
      onClick={(event) => {
        event.stopPropagation();
        onSignHours?.();
      }}
    >
      Firmar horas
    </button>
  ) : null;

  const actionButtons =
    associateButton || signButton ? (
      variant === 'day' ? (
        <div className={styles.dayActions}>
          {associateButton}
          {signButton}
        </div>
      ) : (
        <>
          {associateButton}
          {signButton}
        </>
      )
    ) : null;

  const openLinkedDocument = async (doc: Document, event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const client = clientsMap?.get(doc.clientId);
    try {
      await openDocumentPdf(doc, client);
    } catch {
      if (client) openDocumentPdfLocally(doc, client);
    }
  };

  const assigneeAvatars =
    assignedUsers.length > 0 ? (
      <ActivityAssigneeAvatars
        users={visibleAssignees}
        assigneeSlots={assigneeSlots}
        hiddenCount={hiddenAssigneeCount}
        variant={variant === 'nav' ? 'nav' : 'default'}
        className={styles.assigneeAvatars}
      />
    ) : null;

  const showAssigneeAdd =
    variant === 'nav' && assignedUsers.length === 0 && onEditAssignees != null;

  const typeBadge = typeRef ? (
    <ActivityTypeBadge
      typeRef={typeRef}
      activityTypes={activityTypes}
      hideEmoji
      solid
      className={styles.type}
    />
  ) : null;

  const documentList = showDocumentList ? (
    <ul className={styles.documents} aria-label="Documentos vinculados">
      {linkedDocuments.map((doc) => (
        <li
          key={doc.id}
          className={cx(styles.documentItem, clientsMap && styles.documentItemClickable)}
          role={clientsMap ? 'button' : undefined}
          tabIndex={clientsMap ? 0 : undefined}
          title={
            clientsMap
              ? `Abrir ${DOCUMENT_TYPE_LABELS[doc.type].toLowerCase()} ${doc.number}`
              : undefined
          }
          onClick={clientsMap ? (event) => void openLinkedDocument(doc, event) : undefined}
          onKeyDown={
            clientsMap
              ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  void openLinkedDocument(doc, event);
                }
              : undefined
          }
        >
          <span className={styles.documentLabel}>
            {doc.number}
            <span className={styles.documentType} aria-hidden>
              {' \u00b7 '}
              {DOCUMENT_TYPE_LABELS[doc.type]}
            </span>
          </span>
          <span className={styles.documentAmount}>
            {doc.total.toFixed(2)}
            {'\u00a0\u20ac'}
          </span>
        </li>
      ))}
    </ul>
  ) : null;

  const signatureLine =
    workerSignaturesEnabled && !typeUsesWorkReport && signatureSummary ? (
    <p
      className={cx(
        styles.signatures,
        signatureSummary.allSigned && styles.signaturesComplete,
      )}
      title={formatActivityPreviewSignatureTitle(signatureSummary)}
    >
      Firmas: {formatActivityPreviewSignatureLabel(signatureSummary)}
    </p>
  ) : null;

  const workReportLine =
    typeUsesWorkReport && workReportSummary ? (
      <p
        className={cx(
          styles.signatures,
          workReportSummary.status === 'submitted' && styles.signaturesComplete,
          workReportSummary.status === 'none' && ui.textMuted,
        )}
        title={formatActivityPreviewWorkReportTitle(workReportSummary)}
      >
        Informe: {formatActivityPreviewWorkReportLabel(workReportSummary)}
      </p>
    ) : null;

  if (variant === 'day') {
    return (
      <div className={cx(styles.root, styles.day)}>
        {assigneeAvatars ? (
          <div className={styles.dayAside}>
            <ActivityAssigneeAvatars
              users={visibleAssignees}
              assigneeSlots={assigneeSlots}
              hiddenCount={hiddenAssigneeCount}
              stacked
              className={styles.dayAssigneeAvatars}
            />
          </div>
        ) : null}
        <div className={styles.dayBody}>
          <div className={styles.dayBodyMain}>
            <div className={styles.dayTitleRow}>
              <p className={styles.title}>{clientName}</p>
              {typeBadge}
            </div>
            {description ? <p className={styles.message}>{description}</p> : null}
            <div className={styles.dayDetailsRow}>
              <div className={styles.meta}>
                <span className={styles.metaPrimary}>{metaPrimary}</span>
                {metaDetails.length > 0 ? (
                  <ul className={styles.metaDetails} aria-label="Fecha y horario">
                    {metaDetails.map((detail) => (
                      <li key={detail} className={styles.metaDetail}>
                        {detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {signatureLine}
              {workReportLine}
            </div>
            {documentList}
          </div>
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.root, variant === 'nav' && styles.nav)}>
      <div className={styles.header}>
        <p className={styles.title}>{clientName}</p>
        {assigneeAvatars ? (
          <div className={styles.headerAvatars}>{assigneeAvatars}</div>
        ) : showAssigneeAdd ? (
          <button
            type="button"
            className={styles.assigneeAddBtn}
            onClick={(event) => {
              event.stopPropagation();
              onEditAssignees();
            }}
            aria-label="Asignar operarios"
            title="Asignar operarios"
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>

      {typeBadge}

      {description ? <p className={styles.message}>{description}</p> : null}

      <div className={styles.meta}>
        <span className={styles.metaPrimary}>{metaPrimary}</span>
        {metaDetails.length > 0 ? (
          <ul className={styles.metaDetails} aria-label="Fecha y horario">
            {metaDetails.map((detail) => (
              <li key={detail} className={styles.metaDetail}>
                {detail}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {signatureLine}
      {workReportLine}

      {documentList}

      {actionButtons}
    </div>
  );
}
