import { Tags } from 'lucide-react';
import ActivityTypeManager from '@/components/ActivityTypeManager';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import ui from '@/styles/shared.module.css';
import styles from './ActivityTypesSettings.module.css';

export default function ActivityTypesSettings() {
  const { activityTypes, refresh } = useActivityTypes();

  return (
    <section className={ui.pageSection}>
      <h2 className={ui.pageSectionTitle}>Tipos de actividad</h2>
      <ActivityTypeManager
        types={activityTypes}
        onUpdated={refresh}
        embedded
        hideTitle
      />
      <p className={styles.hint}>
        <Tags size={14} aria-hidden />
        Al crear un tipo decides si usa Informe de Trabajo (con albarán) o es una actividad normal.
        Solo los administradores pueden gestionar tipos.
      </p>
    </section>
  );
}
