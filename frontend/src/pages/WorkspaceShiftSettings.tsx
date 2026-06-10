import { useEffect, useMemo, useState } from 'react';
import { describeShiftBoundaries } from '@shared/types';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { Input } from '@/components/forms';
import ui from '@/styles/shared.module.css';
import styles from './WorkspaceShiftSettings.module.css';

type BoundaryFields = {
  nightToMorningAt: string;
  morningToAfternoonAt: string;
  afternoonToNightAt: string;
};

function pickBoundaryFields(
  settings: NonNullable<ReturnType<typeof useWorkspaceScheduleSettings>['settings']>,
): BoundaryFields {
  return {
    nightToMorningAt: settings.nightToMorningAt,
    morningToAfternoonAt: settings.morningToAfternoonAt,
    afternoonToNightAt: settings.afternoonToNightAt,
  };
}

export default function WorkspaceShiftSettings() {
  const { settings, loading, update } = useWorkspaceScheduleSettings();
  const [form, setForm] = useState<BoundaryFields | null>(null);
  const [savedBaseline, setSavedBaseline] = useState<BoundaryFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const next = pickBoundaryFields(settings);
    setForm(next);
    setSavedBaseline(next);
  }, [settings]);

  const preview = useMemo(
    () => (form ? describeShiftBoundaries(form) : null),
    [form],
  );

  const hasChanges = useMemo(() => {
    if (!form || !savedBaseline) return false;
    return JSON.stringify(form) !== JSON.stringify(savedBaseline);
  }, [form, savedBaseline]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await update(form);
      const baseline = pickBoundaryFields(saved);
      setForm(baseline);
      setSavedBaseline(baseline);
      setSuccess('Horarios de turno guardados.');
    } catch {
      setError('No se pudieron guardar los horarios de turno.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={ui.pageSection} aria-labelledby="shift-hours-title">
      <h2 id="shift-hours-title" className={ui.pageSectionTitle}>
        Horarios de turno
      </h2>
      <div className={ui.card}>
        <div className={ui.cardBody}>
          {loading || !form ? (
            <p className={ui.textMuted}>Cargando horarios de turno…</p>
          ) : (
            <form onSubmit={handleSubmit} className={ui.settingsForm}>
              <p className={ui.textMuted}>
                Define a qué hora termina cada franja. Se usa al planificar actividades y en el
                calendario de horarios del workspace.
              </p>

              <div className={ui.formGrid3}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="night-to-morning">
                    Inicio de mañana (fin de noche)
                  </label>
                  <Input
                    id="night-to-morning"
                    type="time"
                    value={form.nightToMorningAt}
                    onChange={(e) =>
                      setForm((current) =>
                        current ? { ...current, nightToMorningAt: e.target.value } : current,
                      )
                    }
                    required
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="morning-to-afternoon">
                    Fin de mañana / inicio de tarde
                  </label>
                  <Input
                    id="morning-to-afternoon"
                    type="time"
                    value={form.morningToAfternoonAt}
                    onChange={(e) =>
                      setForm((current) =>
                        current ? { ...current, morningToAfternoonAt: e.target.value } : current,
                      )
                    }
                    required
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="afternoon-to-night">
                    Fin de tarde / inicio de noche
                  </label>
                  <Input
                    id="afternoon-to-night"
                    type="time"
                    value={form.afternoonToNightAt}
                    onChange={(e) =>
                      setForm((current) =>
                        current ? { ...current, afternoonToNightAt: e.target.value } : current,
                      )
                    }
                    required
                  />
                </div>
              </div>

              {preview && (
                <div className={styles.previewBlock} aria-labelledby="shift-preview-title">
                  <p id="shift-preview-title" className={styles.previewTitle}>
                    Vista previa
                  </p>
                  <ul className={styles.previewList}>
                    <li>
                      <strong>Mañana (M):</strong> {preview.morning}
                    </li>
                    <li>
                      <strong>Tarde (T):</strong> {preview.afternoon}
                    </li>
                    <li>
                      <strong>Noche (N):</strong> {preview.night}
                    </li>
                  </ul>
                </div>
              )}

              {error && <p className={ui.alertError}>{error}</p>}
              {success && <p className={ui.alertSuccess}>{success}</p>}

              <div className={styles.actions}>
                <button type="submit" className={ui.btnPrimary} disabled={saving || !hasChanges}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
