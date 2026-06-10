import { useEffect, useState } from 'react';
import { Signature } from 'lucide-react';
import { authService } from '@/api';
import SignaturePad from '@/components/SignaturePad';
import ui from '@/styles/shared.module.css';
import styles from './SignatureSettings.module.css';

export default function SignatureSettings() {
  const currentUser = authService.getCurrentUser();
  const [signature, setSignature] = useState<string | null>(currentUser?.signatureDataUrl ?? null);
  const [savedSignature, setSavedSignature] = useState<string | null>(
    currentUser?.signatureDataUrl ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const url = currentUser?.signatureDataUrl ?? null;
    setSignature(url);
    setSavedSignature(url);
  }, [currentUser?.signatureDataUrl]);

  const dirty = signature !== savedSignature;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await authService.updateProfile({ signatureDataUrl: signature });
      setSavedSignature(signature);
      setSuccess('Firma guardada correctamente.');
    } catch {
      setError('No se pudo guardar la firma.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={ui.pageSection} aria-labelledby="signature-settings-title">
      <h2 id="signature-settings-title" className={ui.pageSectionTitle}>
        Firma
      </h2>
      <p className={styles.intro}>
        Cualquier usuario del equipo (operarios y administradores) puede guardar su firma aquí. Se
        aplicará al guardar actividades y en los PDF de documentos vinculados, para identificar quién
        registró o generó cada registro.
      </p>
      <form onSubmit={handleSubmit} className={ui.settingsForm}>
        <SignaturePad value={signature ?? undefined} onChange={setSignature} disabled={saving} />
        {error && (
          <p className={ui.alertError} role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className={ui.alertSuccess} role="status">
            {success}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={ui.btnPrimary} disabled={!dirty || saving}>
            {saving ? 'Guardando…' : 'Guardar firma'}
          </button>
        </div>
      </form>
      <p className={styles.hint}>
        <Signature size={14} aria-hidden />
        Sin firma guardada, las actividades no quedarán marcadas como firmadas en la tabla.
      </p>
    </section>
  );
}
