import { useEffect, useState } from 'react';
import {
  workspaceAppearanceSettingsService,
  type WorkspaceAppearanceSettingsView,
} from '@/api/workspaceAppearanceSettings';
import {
  applyWorkspaceTypography,
  dispatchWorkspaceTypographyUpdated,
} from '@/lib/workspaceTypography';
import {
  DEFAULT_WORKSPACE_HEADING_FONT_ID,
  DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
  WORKSPACE_HEADING_FONT_OPTIONS,
  WORKSPACE_SUBTITLE_FONT_OPTIONS,
  type WorkspaceFontOption,
} from '@shared/types';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from '@/pages/AppearanceSettings.module.css';

type FontPickerProps = {
  label: string;
  hint: string;
  previewText: string;
  options: readonly WorkspaceFontOption[];
  value: string;
  defaultId: string;
  disabled?: boolean;
  onChange: (fontId: string) => void;
};

function FontPicker({
  label,
  hint,
  previewText,
  options,
  value,
  defaultId,
  disabled = false,
  onChange,
}: FontPickerProps) {
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <div className={styles.typographyGroup}>
      <div className={styles.typographyGroupHeader}>
        <p className={styles.logoCardLabel}>{label}</p>
        <p className={styles.logoCardHint}>{hint}</p>
      </div>

      <div
        className={styles.typographyPreview}
        style={{ fontFamily: selected?.stack }}
        aria-hidden="true"
      >
        {previewText}
      </div>

      <div className={styles.typographyOptions} role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const isDefault = option.id === defaultId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value === option.id}
              className={cx(
                styles.typographyOption,
                value === option.id && styles.typographyOptionActive,
              )}
              style={{ fontFamily: option.stack }}
              disabled={disabled}
              onClick={() => onChange(option.id)}
            >
              <span className={styles.typographyOptionLabel}>{option.label}</span>
              {isDefault && <span className={styles.typographyOptionBadge}>Predeterminada</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WorkspaceTypographySettings() {
  const [settings, setSettings] = useState<WorkspaceAppearanceSettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await workspaceAppearanceSettingsService.get();
        if (!cancelled) {
          setSettings(data);
        }
      } catch {
        if (!cancelled) {
          setError('No se pudo cargar la tipografia del workspace.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistTypography = async (headingFontId: string, subtitleFontId: string) => {
    setSaving(true);
    setError(null);
    try {
      const next = await workspaceAppearanceSettingsService.update({
        headingFontId,
        subtitleFontId,
      });
      setSettings(next);
      applyWorkspaceTypography(next.headingFontId, next.subtitleFontId);
      dispatchWorkspaceTypographyUpdated(next.headingFontId, next.subtitleFontId);
    } catch {
      setError('No se pudo guardar la tipografia.');
    } finally {
      setSaving(false);
    }
  };

  const handleHeadingChange = (headingFontId: string) => {
    if (!settings || saving || headingFontId === settings.headingFontId) return;
    const subtitleFontId = settings.subtitleFontId;
    setSettings({ ...settings, headingFontId });
    void persistTypography(headingFontId, subtitleFontId);
  };

  const handleSubtitleChange = (subtitleFontId: string) => {
    if (!settings || saving || subtitleFontId === settings.subtitleFontId) return;
    const headingFontId = settings.headingFontId;
    setSettings({ ...settings, subtitleFontId });
    void persistTypography(headingFontId, subtitleFontId);
  };

  return (
    <section className={ui.pageSection} aria-labelledby="appearance-typography-title">
      <h2 id="appearance-typography-title" className={ui.pageSectionTitle}>
        Tipografia
      </h2>
      <div className={ui.card}>
        <div className={ui.cardBody}>
          <p className={styles.logoSectionHint}>
            Afecta a todo el workspace: titulos, encabezados de seccion y subtitulos.
          </p>

          {loading && <p className={styles.galleryStatus}>Cargando tipografias...</p>}
          {error && <p className={styles.logoError}>{error}</p>}

          {settings && (
            <div className={styles.typographyStack}>
              <FontPicker
                label="Headings"
                hint="Titulos principales y encabezados de seccion."
                previewText="Titulo de ejemplo"
                options={WORKSPACE_HEADING_FONT_OPTIONS}
                value={settings.headingFontId}
                defaultId={DEFAULT_WORKSPACE_HEADING_FONT_ID}
                disabled={saving}
                onChange={handleHeadingChange}
              />

              <FontPicker
                label="Subtitulos"
                hint="Subtitulos y textos descriptivos secundarios."
                previewText="Subtitulo de ejemplo"
                options={WORKSPACE_SUBTITLE_FONT_OPTIONS}
                value={settings.subtitleFontId}
                defaultId={DEFAULT_WORKSPACE_SUBTITLE_FONT_ID}
                disabled={saving}
                onChange={handleSubtitleChange}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
