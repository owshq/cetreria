import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { cx } from '@/lib/cx';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import { storageKeys } from '@/lib/storageKeys';
import DocumentFormatSettings from './DocumentFormatSettings';
import DocumentTemplateSettings from './DocumentTemplateSettings';
import InvoiceConceptsSettings from './InvoiceConceptsSettings';
import VerifactuSettings from './VerifactuSettings';
import styles from './FinancialDocumentsSettings.module.css';

type FinancialDocumentsTab =
  | 'document-formats'
  | 'document-template'
  | 'invoice-concepts'
  | 'verifactu';

const ALL_TABS: Array<{ id: FinancialDocumentsTab; label: string }> = [
  { id: 'document-formats', label: 'Numeración' },
  { id: 'document-template', label: 'Plantilla PDF' },
  { id: 'invoice-concepts', label: 'Conceptos' },
  { id: 'verifactu', label: 'Veri*Factu' },
];

const LEGACY_SETTINGS_TAB_VALUES = new Set<string>([
  'document-formats',
  'document-template',
  'invoice-concepts',
  'verifactu',
]);

function isFinancialDocumentsTab(value: unknown): value is FinancialDocumentsTab {
  return (
    value === 'document-formats' ||
    value === 'document-template' ||
    value === 'invoice-concepts' ||
    value === 'verifactu'
  );
}

function readFinancialDocumentsTab(): FinancialDocumentsTab {
  try {
    const saved = readWorkspaceScopedStorage(storageKeys.financialDocumentsTab);
    if (saved && isFinancialDocumentsTab(saved)) {
      return saved;
    }

    const legacySettingsTab = readWorkspaceScopedStorage(storageKeys.settingsTab);
    if (legacySettingsTab && LEGACY_SETTINGS_TAB_VALUES.has(legacySettingsTab)) {
      return legacySettingsTab as FinancialDocumentsTab;
    }
  } catch {
    // Ignore quota / private mode errors.
  }

  return 'document-formats';
}

function writeFinancialDocumentsTab(tab: FinancialDocumentsTab): void {
  try {
    writeWorkspaceScopedStorage(tab, storageKeys.financialDocumentsTab);
  } catch {
    // Ignore quota / private mode errors.
  }
}

export default function FinancialDocumentsSettings() {
  const { verifactuEnabled } = useWorkspaceFeatureSettings();
  const [activeTab, setActiveTab] = useState<FinancialDocumentsTab>(readFinancialDocumentsTab);

  const tabs = useMemo(
    () =>
      verifactuEnabled
        ? ALL_TABS
        : ALL_TABS.filter((tab) => tab.id !== 'verifactu'),
    [verifactuEnabled],
  );

  useEffect(() => {
    if (!verifactuEnabled && activeTab === 'verifactu') {
      setActiveTab('document-formats');
      writeFinancialDocumentsTab('document-formats');
    }
  }, [verifactuEnabled, activeTab]);

  const selectTab = (tab: FinancialDocumentsTab) => {
    setActiveTab(tab);
    writeFinancialDocumentsTab(tab);
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h2 id="financial-documents-title" className={styles.title}>
          Documentos financieros
        </h2>
        <p className={styles.intro}>
          {verifactuEnabled
            ? 'Configura la numeracion, la plantilla PDF, el catalogo de conceptos y Veri*Factu para facturas y albaranes.'
            : 'Configura la numeracion, la plantilla PDF y el catalogo de conceptos para facturas y albaranes.'}
        </p>
      </header>

      <nav
        className={styles.tabsBar}
        role="tablist"
        aria-label="Secciones de documentos financieros"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`financial-documents-panel-${id}`}
            id={`financial-documents-tab-${id}`}
            className={cx(styles.tab, activeTab === id && styles.tabActive)}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div
        role="tabpanel"
        id={`financial-documents-panel-${activeTab}`}
        aria-labelledby={`financial-documents-tab-${activeTab}`}
        className={styles.tabPanel}
      >
        {activeTab === 'document-formats' && <DocumentFormatSettings subsection />}
        {activeTab === 'document-template' && <DocumentTemplateSettings subsection />}
        {activeTab === 'invoice-concepts' && <InvoiceConceptsSettings subsection />}
        {activeTab === 'verifactu' && <VerifactuSettings subsection />}
      </div>
    </div>
  );
}
