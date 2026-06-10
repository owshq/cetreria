import { useEffect, useMemo, useState } from 'react';
import { workspaceBillingSettingsService } from '@/api';
import type { WorkspaceDocumentFormats } from '@shared/types';
import { normalizeWorkspaceDocumentFormats } from '@shared/types';
import DocumentFormatEditor, { DocumentTypeTabs } from '@/components/DocumentFormatEditor';
import type { Document } from '@shared/types';
import { useWorkspace } from '@/context/useWorkspace';
import ui from '@/styles/shared.module.css';

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!documentFormats || saving || !hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await workspaceBillingSettingsService.update({ documentFormats });
      const formats = normalizeWorkspaceDocumentFormats(saved.documentFormats);
      setDocumentFormats(formats);
      setSavedBaseline(formats);
      await refreshWorkspaces();
      setSuccess('Formatos de documento guardados.');
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
