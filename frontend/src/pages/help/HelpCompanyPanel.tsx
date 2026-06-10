import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import HelpArticle from './HelpArticle';
import { HELP_TOPICS } from './helpTopics';
import styles from '../Help.module.css';

type HelpCompanyPanelProps = {
  companyName: string | null;
  loading: boolean;
  isAdmin: boolean;
  onNavigate: (path: string) => void;
};

export default function HelpCompanyPanel({
  companyName,
  loading,
  isAdmin,
  onNavigate,
}: HelpCompanyPanelProps) {
  const topic = HELP_TOPICS.company;

  return (
    <HelpArticle
      topic={topic}
      onNavigate={onNavigate}
      footer={
        <section className={styles.articleBlock}>
          <h2 className={styles.articleBlockTitle}>Tu empresa ahora</h2>
          {loading ? (
            <p className={ui.textMuted}>Cargando nombre de la empresa...</p>
          ) : (
            <div className={cx(ui.card, styles.companyCard)}>
              <div className={ui.cardBody}>
                <p className={styles.companyName}>{companyName}</p>
                <p className={styles.companyMeta}>Nombre actual en documentos y reportes</p>
              </div>
            </div>
          )}
          {!isAdmin ? (
            <p className={styles.adminNote}>
              Solo los administradores pueden editar estos datos. Pide el cambio a un
              administrador del workspace.
            </p>
          ) : null}
        </section>
      }
    />
  );
}
