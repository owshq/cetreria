import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import { Save, Trash2 } from 'lucide-react';
import DocumentTemplateColorPicker from '@/components/DocumentTemplateColorPicker';
import { Textarea } from '@/components/forms';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import {
  buildDocumentHtmlTemplatePreview,
  getDocumentTemplatePreviewObjectUrl,
  renderDocumentTemplatePreview,
} from '@/lib/renderDocumentTemplatePreview';
import {
  deleteSavedDocumentTemplate,
  readSavedDocumentTemplates,
  upsertSavedDocumentTemplate,
  type SavedDocumentTemplate,
} from '@/lib/savedDocumentTemplates';
import {
  DEFAULT_DOCUMENT_HTML_TEMPLATE,
  DOCUMENT_HTML_TEMPLATE_PLACEHOLDERS,
  DOCUMENT_TEMPLATE_OPTIONS,
  type DocumentTemplateId,
} from '@shared/types';
import ui from '@/styles/shared.module.css';
import previewModalStyles from './documentPreviewModal.module.css';
import styles from './DocumentTemplatePicker.module.css';

type DocumentTemplatePickerProps = {
  templateId: DocumentTemplateId;
  templateColor: string;
  customHtml?: string;
  customHtmlFileName?: string;
  documentFooterText?: string;
  documentLogoDataUrl?: string;
  onTemplateIdChange: (templateId: DocumentTemplateId) => void;
  onTemplateColorChange: (templateColor: string) => void;
  onCustomHtmlChange: (customHtml: string | undefined, fileName?: string) => void;
  colorFieldId?: string;
};

const MAX_CUSTOM_HTML_BYTES = 512 * 1024;

function DocumentTemplatePreview({
  templateId,
  templateColor,
  customHtml,
  documentFooterText,
  documentLogoDataUrl,
}: {
  templateId: DocumentTemplateId;
  templateColor: string;
  customHtml?: string;
  documentFooterText?: string;
  documentLogoDataUrl?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    const render = async () => {
      if (cancelled || requestId !== requestIdRef.current) return;

      try {
        await renderDocumentTemplatePreview(
          canvas,
          templateId,
          templateColor,
          frame.clientWidth,
          renderTaskRef,
          customHtml,
          documentFooterText,
          documentLogoDataUrl,
        );
      } catch {
        // Ignorar cancelaciones de pdf.js al desmontar o re-renderizar.
      }
    };

    void render();

    const observer = new ResizeObserver(() => {
      void render();
    });
    observer.observe(frame);

    return () => {
      cancelled = true;
      observer.disconnect();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [templateId, templateColor, customHtml, documentFooterText, documentLogoDataUrl]);

  return (
    <div ref={frameRef} className={styles.templatePreview} aria-hidden>
      <canvas ref={canvasRef} className={styles.templatePreviewCanvas} />
    </div>
  );
}

export default function DocumentTemplatePicker({
  templateId,
  templateColor,
  customHtml,
  customHtmlFileName,
  documentFooterText,
  documentLogoDataUrl,
  onTemplateIdChange,
  onTemplateColorChange,
  onCustomHtmlChange,
  colorFieldId = 'document-template-color',
}: DocumentTemplatePickerProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<DocumentTemplateId | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedDocumentTemplate[]>(() =>
    readSavedDocumentTemplates(),
  );
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const editorHtml = customHtml?.trim() ? customHtml : DEFAULT_DOCUMENT_HTML_TEMPLATE;

  const previewTemplateLabel =
    DOCUMENT_TEMPLATE_OPTIONS.find((option) => option.id === previewTemplateId)?.label ??
    'Plantilla';

  const customHtmlPreview = useMemo(() => {
    if (previewTemplateId !== 'custom') return null;
    return buildDocumentHtmlTemplatePreview(
      templateColor,
      editorHtml,
      documentFooterText,
      documentLogoDataUrl,
    );
  }, [previewTemplateId, templateColor, editorHtml, documentFooterText, documentLogoDataUrl]);

  const closePreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewTemplateId(null);
    setPreviewOpen(false);
  }, []);

  usePopupEscape(previewOpen, closePreview);

  useEffect(() => {
    setSaveName(customHtmlFileName?.trim() ?? '');
  }, [customHtmlFileName]);

  const openPreview = (previewId: DocumentTemplateId) => {
    try {
      if (previewId !== 'custom') {
        const url = getDocumentTemplatePreviewObjectUrl(
          previewId,
          templateColor,
          undefined,
          documentFooterText,
          documentLogoDataUrl,
        );
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return url;
        });
      } else {
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      }
      setPreviewTemplateId(previewId);
      setPreviewOpen(true);
    } catch {
      window.alert('No se pudo generar la vista previa de la plantilla.');
    }
  };

  const handleSelectTemplate = (nextTemplateId: DocumentTemplateId) => {
    if (nextTemplateId === 'custom' && !customHtml?.trim()) {
      onCustomHtmlChange(DEFAULT_DOCUMENT_HTML_TEMPLATE, 'Plantilla corporativa');
    }
    onTemplateIdChange(nextTemplateId);
  };

  const handleSaveNamedTemplate = () => {
    const trimmedName = saveName.trim();
    const trimmedHtml = editorHtml.trim();

    if (!trimmedName) {
      setSaveError('Escribe un nombre para la plantilla.');
      return;
    }
    if (!trimmedHtml) {
      setSaveError('La plantilla HTML no puede estar vacia.');
      return;
    }
    if (new Blob([trimmedHtml]).size > MAX_CUSTOM_HTML_BYTES) {
      setSaveError('La plantilla HTML no puede superar 512 KB.');
      return;
    }

    const saved = upsertSavedDocumentTemplate(trimmedName, trimmedHtml);
    setSavedTemplates(readSavedDocumentTemplates());
    onCustomHtmlChange(trimmedHtml, saved.name);
    setSaveError(null);
  };

  const handleSelectSavedTemplate = (template: SavedDocumentTemplate) => {
    onCustomHtmlChange(template.html, template.name);
    onTemplateIdChange('custom');
    setSaveName(template.name);
    setSaveError(null);
  };

  const handleDeleteSavedTemplate = (template: SavedDocumentTemplate) => {
    if (!window.confirm(`Eliminar la plantilla "${template.name}"?`)) return;
    deleteSavedDocumentTemplate(template.id);
    setSavedTemplates(readSavedDocumentTemplates());
  };

  const isSavedTemplateActive = (template: SavedDocumentTemplate) =>
    templateId === 'custom' &&
    (customHtmlFileName === template.name || customHtml === template.html);

  return (
    <>
      <div
        className={styles.wrap}
        style={{ '--template-accent': templateColor } as CSSProperties}
      >
        <div className={styles.templatePicker} role="radiogroup" aria-label="Plantilla PDF">
          {DOCUMENT_TEMPLATE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={templateId === option.id}
              aria-label={`${option.label}. Doble clic para vista previa.`}
              className={cx(
                styles.templateOption,
                templateId === option.id && styles.templateOptionActive,
              )}
              onClick={() => handleSelectTemplate(option.id)}
              onDoubleClick={() => openPreview(option.id)}
            >
              <DocumentTemplatePreview
                templateId={option.id}
                templateColor={templateColor}
                customHtml={option.id === 'custom' ? editorHtml : undefined}
                documentFooterText={documentFooterText}
                documentLogoDataUrl={documentLogoDataUrl}
              />
              <span className={styles.templateOptionLabel}>{option.label}</span>
              <span className={styles.templateOptionDesc}>{option.description}</span>
            </button>
          ))}
        </div>

        {templateId === 'custom' ? (
          <div className={styles.customTemplatePanel}>
            <div className={styles.customTemplateHeader}>
              <label className={ui.label} htmlFor="document-template-html-editor">
                HTML de la plantilla
              </label>
              <p className={styles.customTemplateHint}>
                Parte del HTML corporativo. Usa marcadores como{' '}
                <code>{'{{documentNumber}}'}</code>, <code>{'{{clientName}}'}</code> o{' '}
                <code>{'{{itemsRows}}'}</code>.
              </p>
            </div>

            <Textarea
              id="document-template-html-editor"
              className={styles.htmlEditor}
              rows={18}
              spellCheck={false}
              value={editorHtml}
              onChange={(event) => {
                onCustomHtmlChange(event.target.value, customHtmlFileName);
                setSaveError(null);
              }}
            />

            <div className={styles.saveNamedRow}>
              <input
                type="text"
                className={styles.saveNameInput}
                value={saveName}
                placeholder="Nombre de la plantilla"
                onChange={(event) => {
                  setSaveName(event.target.value);
                  setSaveError(null);
                }}
              />
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={handleSaveNamedTemplate}
              >
                <Save size={16} aria-hidden />
                Guardar con nombre
              </button>
            </div>
            {saveError ? <p className={ui.alertError}>{saveError}</p> : null}

            {savedTemplates.length > 0 ? (
              <div className={styles.savedTemplatesSection}>
                <p className={styles.savedTemplatesTitle}>Plantillas guardadas</p>
                <ul className={styles.savedTemplatesList}>
                  {savedTemplates.map((template) => (
                    <li key={template.id} className={styles.savedTemplateItem}>
                      <button
                        type="button"
                        className={cx(
                          styles.savedTemplateSelect,
                          isSavedTemplateActive(template) && styles.savedTemplateSelectActive,
                        )}
                        onClick={() => handleSelectSavedTemplate(template)}
                      >
                        {template.name}
                      </button>
                      <button
                        type="button"
                        className={styles.savedTemplateDelete}
                        onClick={() => handleDeleteSavedTemplate(template)}
                        aria-label={`Eliminar ${template.name}`}
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <details className={styles.placeholderList}>
              <summary>Marcadores disponibles</summary>
              <ul>
                {DOCUMENT_HTML_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                  <li key={placeholder}>
                    <code>{placeholder}</code>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}

        <div className={cx(ui.field, styles.templateColorField)}>
          <label className={ui.label} htmlFor={colorFieldId}>
            Color de acento
          </label>
          <DocumentTemplateColorPicker
            value={templateColor}
            onChange={onTemplateColorChange}
          />
        </div>
      </div>

      {previewOpen && previewTemplateId ? (
        <ModalOverlay>
          <div
            className={cx(ui.modal, previewModalStyles.previewPanel)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-template-preview-title"
          >
            <ModalHeader
              title={`Vista previa · ${previewTemplateLabel}`}
              titleId="document-template-preview-title"
              onClose={closePreview}
              closeLabel="Cerrar vista previa"
            >
              <p className={previewModalStyles.previewHint}>
                Ejemplo con datos de muestra · doble clic en una plantilla para abrir esta vista
              </p>
            </ModalHeader>
            <div className={previewModalStyles.previewBody}>
              {previewTemplateId === 'custom' && customHtmlPreview ? (
                <iframe
                  className={previewModalStyles.htmlPreviewFrame}
                  title="Vista previa de la plantilla HTML"
                  srcDoc={customHtmlPreview}
                  sandbox=""
                />
              ) : previewUrl ? (
                <PdfViewer
                  className={previewModalStyles.previewFrame}
                  src={previewUrl}
                  fileName="plantilla-ejemplo.pdf"
                  title="Vista previa de la plantilla PDF"
                />
              ) : null}
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </>
  );
}
