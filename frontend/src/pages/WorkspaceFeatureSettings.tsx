import { useEffect, useState } from 'react';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import ui from '@/styles/shared.module.css';
import styles from './WorkspaceFeatureSettings.module.css';

type FeatureToggleProps = {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

function FeatureToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: FeatureToggleProps) {
  return (
    <label className={styles.toggleRow} htmlFor={id}>
      <span className={styles.toggleCopy}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDescription}>{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export default function WorkspaceFeatureSettingsPanel() {
  const { settings, loading, update } = useWorkspaceFeatureSettings();
  const [workerSignaturesEnabled, setWorkerSignaturesEnabled] = useState(false);
  const [shiftSchedulingEnabled, setShiftSchedulingEnabled] = useState(false);
  const [invoiceConceptFreeCreationEnabled, setInvoiceConceptFreeCreationEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setWorkerSignaturesEnabled(settings.workerSignaturesEnabled);
    setShiftSchedulingEnabled(settings.shiftSchedulingEnabled);
    setInvoiceConceptFreeCreationEnabled(settings.invoiceConceptFreeCreationEnabled);
  }, [settings]);

  const dirty =
    settings != null &&
    (workerSignaturesEnabled !== settings.workerSignaturesEnabled ||
      shiftSchedulingEnabled !== settings.shiftSchedulingEnabled ||
      invoiceConceptFreeCreationEnabled !== settings.invoiceConceptFreeCreationEnabled);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await update({
        workerSignaturesEnabled,
        shiftSchedulingEnabled,
        invoiceConceptFreeCreationEnabled,
      });
      setSuccess('Funcionalidades actualizadas.');
    } catch {
      setError('No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={ui.pageSection} aria-labelledby="workspace-features-title">
      <h2 id="workspace-features-title" className={ui.pageSectionTitle}>
        Funcionalidades
      </h2>
      <p className={styles.intro}>
        Activa modulos operativos opcionales. Por defecto estan desactivados: los operarios
        registran actividades sin turnos ni firma de horas. Puedes activarlos mas adelante si crees
        necesario.
      </p>
      <form onSubmit={handleSubmit} className={ui.settingsForm}>
        <div className={ui.card}>
          <div className={styles.cardBody}>
            <FeatureToggle
              id="feature-shift-scheduling"
              label="Turnos y cuadrante"
              description="Calendario de turnos M/T/N, tramos por operario y columnas de turno en actividades."
              checked={shiftSchedulingEnabled}
              disabled={loading || saving}
              onChange={setShiftSchedulingEnabled}
            />
            <FeatureToggle
              id="feature-worker-signatures"
              label="Firma de horas"
              description="Firma manuscrita por operario, confirmación de horas reales y columnas de horas firmadas."
              checked={workerSignaturesEnabled}
              disabled={loading || saving}
              onChange={setWorkerSignaturesEnabled}
            />
            <FeatureToggle
              id="feature-invoice-concept-free-creation"
              label="Creación libre de conceptos"
              description="Permite crear conceptos nuevos al facturar o en partes de trabajo. Desactivado: solo los del catálogo en Documentos financieros > Conceptos."
              checked={invoiceConceptFreeCreationEnabled}
              disabled={loading || saving}
              onChange={setInvoiceConceptFreeCreationEnabled}
            />
          </div>
        </div>
        {error ? (
          <p className={ui.alertError} role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className={ui.alertSuccess} role="status">
            {success}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="submit" className={ui.btnPrimary} disabled={!dirty || saving || loading}>
            {saving ? 'Guardando�' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </section>
  );
}
