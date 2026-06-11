import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CircleMinus } from 'lucide-react';
import {
  workspaceAppearanceSettingsService,
  type LoginBackgroundImageView,
  type WorkspaceAppearanceSettingsView,
} from '@/api/workspaceAppearanceSettings';
import ConfirmDialog from '@/components/ConfirmDialog';
import { MAX_LOGIN_BACKGROUND_IMAGES } from '@shared/types';
import ui from '@/styles/shared.module.css';
import styles from '@/pages/AppearanceSettings.module.css';

function downloadExternalImage(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
}

export default function LoginBackgroundGallerySettings() {
  const [settings, setSettings] = useState<WorkspaceAppearanceSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoginBackgroundImageView | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await workspaceAppearanceSettingsService.get();
      setSettings(data);
    } catch {
      setError('No se pudo cargar la galeria del login.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const applySettings = (next: WorkspaceAppearanceSettingsView, message: string) => {
    setSettings(next);
    setSuccess(message);
    setError(null);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const next = await workspaceAppearanceSettingsService.uploadImage(file);
      applySettings(next, 'Imagen subida a la galeria.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddExternal = async () => {
    const url = externalUrl.trim();
    if (!url) return;
    setBusyId('external');
    setError(null);
    setSuccess(null);
    try {
      const next = await workspaceAppearanceSettingsService.addExternalUrl(url);
      setExternalUrl('');
      applySettings(next, 'Imagen externa anadida.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la URL.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (image: LoginBackgroundImageView) => {
    setBusyId(image.id);
    setError(null);
    setSuccess(null);
    try {
      const next = await workspaceAppearanceSettingsService.removeImage(image.id);
      applySettings(next, 'Imagen eliminada de la galeria.');
      setDeleteTarget(null);
    } catch {
      setError('No se pudo eliminar la imagen.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await handleRemove(deleteTarget);
  };

  const handleDownload = async (image: LoginBackgroundImageView) => {
    setBusyId(`download-${image.id}`);
    setError(null);
    try {
      if (image.source === 'uploaded') {
        const filename = image.filename ?? `fondo-login-${image.id}.jpg`;
        await workspaceAppearanceSettingsService.downloadUploadedImage(image.id, filename);
      } else if (image.externalUrl) {
        downloadExternalImage(
          image.externalUrl,
          image.filename ?? `fondo-login-externo.jpg`,
        );
      }
    } catch {
      setError('No se pudo descargar la imagen.');
    } finally {
      setBusyId(null);
    }
  };

  const imageCount = settings?.loginBackgroundImages.length ?? 0;
  const atLimit = imageCount >= MAX_LOGIN_BACKGROUND_IMAGES;

  return (
    <section className={ui.pageSection} aria-labelledby="appearance-login-gallery-title">
      <h2 id="appearance-login-gallery-title" className={ui.pageSectionTitle}>
        Galeria del login
      </h2>
      <div className={ui.card}>
        <div className={ui.cardBody}>
          <p className={styles.logoSectionHint}>
            Imágenes de fondo del inicio de sesión. Rotan cada 4 segundos. Solo administradores
            pueden gestionarlas.
          </p>

          {loading ? (
            <p className={styles.galleryStatus}>Cargando galeria...</p>
          ) : (
            <>
              <p className={styles.galleryCount}>
                {imageCount} / {MAX_LOGIN_BACKGROUND_IMAGES} imagenes
              </p>

              <div className={styles.galleryGrid}>
                {settings?.loginBackgroundImages.map((image, index) => (
                  <article key={image.id} className={styles.galleryCard}>
                    <div
                      className={styles.galleryThumb}
                      style={{ backgroundImage: `url('${image.resolvedUrl}')` }}
                      role="img"
                      aria-label={`Fondo ${index + 1}`}
                    />
                    <div className={styles.galleryMeta}>
                      <span className={styles.galleryBadge}>
                        {image.source === 'uploaded' ? 'Subida' : 'Externa'}
                      </span>
                      {image.filename && (
                        <span className={styles.galleryFilename} title={image.filename}>
                          {image.filename}
                        </span>
                      )}
                    </div>
                    <div className={styles.galleryActions}>
                      <button
                        type="button"
                        className={ui.btnIcon}
                        onClick={() => void handleDownload(image)}
                        disabled={busyId != null}
                        title="Descargar"
                        aria-label="Descargar imagen"
                      >
                        <ArrowDownToLine size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={ui.btnIconDanger}
                        onClick={() => setDeleteTarget(image)}
                        disabled={busyId != null}
                        title="Eliminar"
                        aria-label="Eliminar imagen"
                      >
                        <CircleMinus size={16} aria-hidden />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className={styles.galleryToolbar}>
                <button
                  type="button"
                  className={ui.btnSecondary}
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading || atLimit || busyId != null}
                >
                  {uploading ? 'Subiendo...' : 'Subir imagen'}
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.hiddenInput}
                  onChange={(event) => {
                    void handleUpload(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />

                <div className={styles.galleryUrlField}>
                  <input
                    type="url"
                    className={ui.input}
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.target.value)}
                    placeholder="https://..."
                    disabled={atLimit || busyId != null}
                  />
                  <button
                    type="button"
                    className={ui.btnSecondary}
                    onClick={() => void handleAddExternal()}
                    disabled={!externalUrl.trim() || atLimit || busyId === 'external'}
                  >
                    Añadir URL
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <p className={styles.logoError}>{error}</p>}
          {success && <p className={styles.gallerySuccess}>{success}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar imagen"
        message={
          deleteTarget
            ? `¿Eliminar ${
                deleteTarget.filename ? `"${deleteTarget.filename}"` : 'esta imagen'
              } de la galeria del login? Esta accion es irreversible.`
            : ''
        }
        loading={deleteTarget !== null && busyId === deleteTarget.id}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (busyId !== deleteTarget?.id) setDeleteTarget(null);
        }}
      />
    </section>
  );
}
