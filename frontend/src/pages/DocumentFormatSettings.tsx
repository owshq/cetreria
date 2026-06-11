import { useEffect, useMemo, useState } from 'react';
import { workspaceBillingSettingsService } from '@/api';
import { invalidateResourceCache, resourceCacheKey } from '@/api/resourceCache';
import type { DocumentDisplayNameMigrationPolicy, WorkspaceDocumentFormats } from '@shared/types';
import { hasDocumentNameFormatChanges, normalizeWorkspaceDocumentFormats } from '@shared/types';
import DocumentFormatEditor, { DocumentTypeTabs } from '@/components/DocumentFormatEditor';
import type { Document } from '@shared/types';
import { useWorkspace } from '@/context/useWorkspace';
import ui from '@/styles/shared.module.css';
import styles from './DocumentFormatSettings.module.css';

function areDocumentFormatsEqual(
  left: WorkspaceDocumentFormats,
  right: WorkspaceDocumentFormats,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

type DocumentFormatSettingsProps = {
  subsection?: boolean;
};

export default function DocumentFormatSettings({ subsection = false }: DocumentFormatSettingsProps) {
  const { refreshWorkspaces } = useWorkspace();
  const [activeType, setActiveType] = useState<Document['type']>('invoice');
  const [documentFormats, setDocumentFormats] = useState<WorkspaceDocumentFormats | null>(
    null,
  );
  const [savedBaseline, setSavedBaseline] = useState<WorkspaceDocumentFormats | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [displayNameMigration, setDisplayNameMigration] =
    useState<DocumentDisplayNameMigrationPolicy>('keep');

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const data = await workspaceBillingSettingsService.get();
        if (cancelled) return;

        const formats = normalizeWorkspaceDocumentFormats(data.documentFormats);
        setDocumentFormats(formats);
        setSavedBaseline(formats);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los formatos de documento.');
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = useMemo(() => {
    if (!documentFormats || !savedBaseline) return false;
    return !areDocumentFormatsEqual(documentFormats, savedBaseline);
  }, [documentFormats, savedBaseline]);

  const nameFormatChanged = useMemo(() => {
    if (!documentFormats || !savedBaseline) return false;
    return hasDocumentNameFormatChanges(savedBaseline, documentFormats);
  }, [documentFormats, savedBaseline]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!documentFormats || saving || !hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await workspaceBillingSettingsService.update({
        documentFormats,
        ...(nameFormatChanged ? { documentDisplayNameMigration: displayNameMigration } : {}),
      });
      const formats = normalizeWorkspaceDocumentFormats(saved.documentFormats);
      setDocumentFormats(formats);
      setSavedBaseline(formats);
      setDisplayNameMigration('keep');
      if (nameFormatChanged) {
        invalidateResourceCache(resourceCacheKey('/documents'));
        invalidateResourceCache(resourceCacheKey('/documents/bootstrap'));
      }
      await refreshWorkspaces();
      setSuccess(
        nameFormatChanged && displayNameMigration === 'update'
          ? 'Formatos guardados y nombres de documentos existentes actualizados.'
          : 'Formatos de documento guardados.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los formatos.');
    } finally {
      setSaving(false);
    }
  };

  const TitleTag = subsection ? 'h3' : 'h2';

  return (
    <>
      {documentFormats && (
        <DocumentTypeTabs activeType={activeType} onChange={setActiveType} />
      )}

      <section className={ui.pageSection}>
        <TitleTag className={subsection ? ui.sectionTitle : ui.pageSectionTitle}>
          Numeración y nombre de documentos
        </TitleTag>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            {!documentFormats ? (
              <p className={ui.textMuted}>Cargando formatos…</p>
            ) : (
              <form onSubmit={handleSubmit} className={ui.form}>
                <DocumentFormatEditor
                  value={documentFormats}
                  onChange={setDocumentFormats}
                  activeType={activeType}
                  hideTitle
                />

                {nameFormatChanged && hasChanges && (
                  <div className={styles.migrationBlock}>
                    <p className={styles.migrationTitle}>Documentos existentes</p>
                    <p className={styles.migrationHint}>
                      Has cambiado el formato del nombre. Elige que hacer con los documentos ya
                      creados. El numero de cada documento no cambia.
                    </p>
                    <div className={styles.migrationOptions} role="radiogroup" aria-label="Nombres de documentos existentes">
                      <label className={styles.migrationOption}>
                        <input
                          type="radio"
                          name="displayNameMigration"
                          value="keep"
                          checked={displayNameMigration === 'keep'}
                          onChange={() => setDisplayNameMigration('keep')}
                        />
                        <span>Mantener nombres actuales</span>
                      </label>
                      <label className={styles.migrationOption}>
                        <input
                          type="radio"
                          name="displayNameMigration"
                          value="update"
                          checked={displayNameMigration === 'update'}
                          onChange={() => setDisplayNameMigration('update')}
                        />
                        <span>Actualizar al nuevo formato</span>
                      </label>
                    </div>
                  </div>
                )}

                {error && <p className={ui.alertError}>{error}</p>}
                {success && <p className={ui.alertSuccess}>{success}</p>}

                {hasChanges && (
                  <button type="submit" className={ui.btnPrimary} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar formatos'}
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
