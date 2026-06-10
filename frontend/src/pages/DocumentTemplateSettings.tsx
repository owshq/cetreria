import { useEffect, useRef, useState } from 'react';
import { workspaceBillingSettingsService } from '@/api';
import DocumentTemplatePicker from '@/components/DocumentTemplatePicker';
import { Textarea } from '@/components/forms';
import {
  readLastDocumentTemplatePrefs,
  writeLastDocumentTemplatePrefs,
} from '@/lib/documentTemplatePrefs';
import { readLogoFile } from '@/lib/logoImage';
import { ensureSavedDocumentTemplate } from '@/lib/savedDocumentTemplates';
import {
  DEFAULT_DOCUMENT_FOOTER_TEXT,
  DEFAULT_DOCUMENT_HTML_TEMPLATE,
  normalizeDocumentFooterText,
  normalizeDocumentTemplateId,
  resolveDocumentLogoDataUrl,
  type DocumentTemplatePrefs,
} from '@shared/types';
import ui from '@/styles/shared.module.css';
import styles from './DocumentTemplateSettings.module.css';

function prefsAreEqual(left: DocumentTemplatePrefs, right: DocumentTemplatePrefs): boolean {
  return (
    left.templateId === right.templateId &&
    left.templateColor === right.templateColor &&
    (left.customHtml ?? '') === (right.customHtml ?? '') &&
    (left.customHtmlFileName ?? '') === (right.customHtmlFileName ?? '')
  );
}

type DocumentTemplateSettingsProps = {
  subsection?: boolean;
};

export default function DocumentTemplateSettings({ subsection = false }: DocumentTemplateSettingsProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const normalizePrefs = (value: DocumentTemplatePrefs): DocumentTemplatePrefs => {
    const templateId = normalizeDocumentTemplateId(value.templateId);
    if (templateId === 'custom' && !value.customHtml?.trim()) {
      return {
        ...value,
        templateId,
        customHtml: DEFAULT_DOCUMENT_HTML_TEMPLATE,
        customHtmlFileName: value.customHtmlFileName ?? 'Plantilla corporativa',
      };
    }
    return { ...value, templateId };
  };

  const [prefs, setPrefs] = useState<DocumentTemplatePrefs>(() =>
    normalizePrefs(readLastDocumentTemplatePrefs()),
  );
  const [savedPrefs, setSavedPrefs] = useState<DocumentTemplatePrefs>(() =>
    normalizePrefs(readLastDocumentTemplatePrefs()),
  );
  const [footerText, setFooterText] = useState(DEFAULT_DOCUMENT_FOOTER_TEXT);
  const [savedFooterText, setSavedFooterText] = useState(DEFAULT_DOCUMENT_FOOTER_TEXT);
  const [documentLogoDataUrl, setDocumentLogoDataUrl] = useState<string | undefined>(undefined);
  const [savedDocumentLogoDataUrl, setSavedDocumentLogoDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [logoError, setLogoError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void workspaceBillingSettingsService
      .get()
      .then((settings) => {
        if (cancelled) return;
        const resolvedFooter = normalizeDocumentFooterText(settings.documentFooterText);
        const customHtml = settings.customDocumentHtml?.trim() || undefined;
        const customHtmlFileName = settings.customDocumentHtmlFileName?.trim() || undefined;
        if (customHtml && customHtmlFileName) {
          ensureSavedDocumentTemplate(customHtmlFileName, customHtml);
        }
        setPrefs((current) =>
          normalizePrefs({
            ...current,
            customHtml: customHtml ?? current.customHtml,
            customHtmlFileName: customHtmlFileName ?? current.customHtmlFileName,
          }),
        );
        setSavedPrefs((current) =>
          normalizePrefs({
            ...current,
            customHtml: customHtml ?? current.customHtml,
            customHtmlFileName: customHtmlFileName ?? current.customHtmlFileName,
          }),
        );
        setFooterText(resolvedFooter);
        setSavedFooterText(resolvedFooter);
        setDocumentLogoDataUrl(settings.documentLogoDataUrl);
        setSavedDocumentLogoDataUrl(settings.documentLogoDataUrl);
      })
      .catch(() => {
        // Mantener prefs locales si no hay acceso a ajustes de empresa.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    !prefsAreEqual(prefs, savedPrefs) ||
    footerText.trim() !== savedFooterText.trim() ||
    (documentLogoDataUrl ?? '') !== (savedDocumentLogoDataUrl ?? '');
  const TitleTag = subsection ? 'h3' : 'h2';
  const previewLogoUrl = resolveDocumentLogoDataUrl({ documentLogoDataUrl });

  const handleLogoChange = async (file: File | undefined) => {
    if (!file) return;
    setLogoError(null);
    try {
      const nextLogo = await readLogoFile(file);
      setDocumentLogoDataUrl(nextLogo);
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : 'No se pudo cargar la imagen.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || loading) return;

    if (prefs.templateId === 'custom' && !prefs.customHtml?.trim()) {
      setSaveError('Edita la plantilla HTML o elige la plantilla corporativa.');
      return;
    }

    const trimmedFooter = footerText.trim();
    if (!trimmedFooter) {
      setSaveError('El texto del pie de página no puede estar vacío.');
      return;
    }

    setSaveError(null);

    try {
      await workspaceBillingSettingsService.update({
        customDocumentHtml: prefs.customHtml,
        customHtmlFileName: prefs.customHtmlFileName,
        documentFooterText: trimmedFooter,
        documentLogoDataUrl: documentLogoDataUrl || undefined,
      });
      writeLastDocumentTemplatePrefs(prefs);
      setSavedPrefs(prefs);
      setSavedFooterText(trimmedFooter);
      setSavedDocumentLogoDataUrl(documentLogoDataUrl);
      setSuccess('Plantilla PDF guardada.');
      window.setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'No se pudo guardar la plantilla PDF.',
      );
    }
  };

  return (
    <section className={ui.pageSection} aria-labelledby="document-template-settings-title">
      <TitleTag
        id="document-template-settings-title"
        className={subsection ? ui.sectionTitle : ui.pageSectionTitle}
      >
        Plantilla PDF
      </TitleTag>
      <p className={styles.intro}>
        Define la plantilla, el logo y el color de acento por defecto para los PDF generados. Se
        aplicar? a los documentos nuevos y a las vistas previas.
      </p>
      <form className={ui.settingsForm} onSubmit={(event) => void handleSubmit(event)}>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <DocumentTemplatePicker
              colorFieldId="settings-document-template-color"
              templateId={prefs.templateId}
              templateColor={prefs.templateColor}
              customHtml={prefs.customHtml}
              customHtmlFileName={prefs.customHtmlFileName}
              documentFooterText={footerText}
              documentLogoDataUrl={documentLogoDataUrl}
              onTemplateIdChange={(templateId) =>
                setPrefs((current) => ({ ...current, templateId }))
              }
              onTemplateColorChange={(templateColor) =>
                setPrefs((current) => ({ ...current, templateColor }))
              }
              onCustomHtmlChange={(customHtml, customHtmlFileName) =>
                setPrefs((current) => ({
                  ...current,
                  customHtml,
                  customHtmlFileName: customHtml
                    ? customHtmlFileName ?? current.customHtmlFileName
                    : undefined,
                }))
              }
            />
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="document-template-footer-text">
                Pie de página (protección de datos)
              </label>
              <p className={styles.fieldHint}>
                Este texto aparece en el pie de todos los PDF generados (facturas y albaranes).
              </p>
              <Textarea
                id="document-template-footer-text"
                rows={8}
                value={footerText}
                disabled={loading}
                onChange={(event) => setFooterText(event.target.value)}
                placeholder={DEFAULT_DOCUMENT_FOOTER_TEXT}
              />
            </div>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className={ui.field}>
              <label className={ui.label}>Logo del documento</label>
              <p className={styles.fieldHint}>
                Aparece en la cabecera de facturas y albaranes. Se ajusta automáticamente sin
                deformar la imagen.
              </p>
              <div className={styles.logoSection}>
                <div className={styles.logoPreviewFrame}>
                  <img
                    src={previewLogoUrl}
                    alt="Logo del documento"
                    className={styles.logoPreviewImage}
                  />
                </div>
                <div className={styles.logoActions}>
                  <button
                    type="button"
                    className={ui.btnSecondary}
                    disabled={loading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {documentLogoDataUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {documentLogoDataUrl ? (
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={loading}
                      onClick={() => {
                        setDocumentLogoDataUrl(undefined);
                        setLogoError(null);
                      }}
                    >
                      Restaurar logo por defecto
                    </button>
                  ) : null}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className={styles.hiddenFileInput}
                  onChange={(event) => {
                    void handleLogoChange(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                {logoError ? <p className={ui.alertError}>{logoError}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="submit" className={ui.btnPrimary} disabled={!dirty || loading}>
            Guardar plantilla
          </button>
          {success ? <p className={ui.alertSuccess}>{success}</p> : null}
          {saveError ? <p className={ui.alertError}>{saveError}</p> : null}
        </div>
      </form>
    </section>
  );
}
