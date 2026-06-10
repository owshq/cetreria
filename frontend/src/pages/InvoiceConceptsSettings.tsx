import { useState } from 'react';
import { Receipt } from 'lucide-react';
import InvoiceConceptManager from '@/components/InvoiceConceptManager';
import { SearchField } from '@/components/forms';
import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';
import ui from '@/styles/shared.module.css';
import styles from './ActivityTypesSettings.module.css';

type InvoiceConceptsSettingsProps = {
  subsection?: boolean;
};

export default function InvoiceConceptsSettings({ subsection = false }: InvoiceConceptsSettingsProps) {
  const { settings, refresh } = useInvoiceConceptSettings();
  const [searchTerm, setSearchTerm] = useState('');

  const TitleTag = subsection ? 'h3' : 'h2';

  return (
    <section className={ui.pageSection}>
      <TitleTag className={subsection ? ui.sectionTitle : ui.pageSectionTitle}>
        Conceptos de factura
      </TitleTag>
      {settings.length > 0 && (
        <div className={ui.filtersRow}>
          <SearchField
            wrapperClassName={ui.searchWrapper}
            placeholder="Buscar conceptos"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}
      <InvoiceConceptManager
        concepts={settings}
        onUpdated={refresh}
        embedded
        hideTitle
        searchOutside
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <p className={styles.hint}>
        <Receipt size={14} aria-hidden />
        Solo los administradores pueden crear, editar precios o eliminar conceptos del catálogo.
      </p>
    </section>
  );
}
