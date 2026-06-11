import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  getAppFaviconUrl,
  hasCustomAppFavicon,
  resetAppFavicon,
  setAppFavicon,
} from '@/lib/appFavicon';
import {
  getAppLogoUrl,
  getAppLogoSize,
  hasCustomAppLogo,
  resetAppLogo,
  setAppLogo,
  setAppLogoSize,
  APP_LOGO_SIZE_LABELS,
  APP_LOGO_WORDMARK_HEIGHTS,
  type AppLogoSize,
  type AppLogoVariant,
} from '@/lib/appLogo';
import ColorPicker from '@/components/ColorPicker';
import {
  APP_ACCENT_COLOR_PRESETS,
  DEFAULT_APP_ACCENT,
  getAppAccentColor,
  resetAppAccentColor,
  setAppAccentColor,
} from '@/lib/appTheme';
import { readLocalStorageFor } from '@/lib/storageKeys';
import { readFaviconFile, readLogoFile } from '@/lib/logoImage';
import { useTheme } from '@/context/ThemeContext';
import LoginBackgroundGallerySettings from '@/components/LoginBackgroundGallerySettings';
import WorkspaceTypographySettings from '@/components/WorkspaceTypographySettings';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './AppearanceSettings.module.css';

type LogoPreviewSurface = 'accent' | 'surface' | 'dark';

type LogoSectionConfig = {
  variant: AppLogoVariant;
  label: string;
  hint: string;
  previewSurface: LogoPreviewSurface;
  previewKind: 'wordmark' | 'login' | 'icon';
};

const SIDEBAR_LOGO_SECTION: LogoSectionConfig = {
  variant: 'onAccent',
  label: 'Wordmark sidebar',
  hint: 'Sidebar expandido y colapsado. Logo claro sobre fondo de color corporativo.',
  previewSurface: 'accent',
  previewKind: 'wordmark',
};

const LOADING_LOGO_SECTION: LogoSectionConfig = {
  variant: 'light',
  label: 'Logo de carga',
  hint: 'Animacion al cargar paginas y contenido. Por defecto usa el logo con letras de modo claro.',
  previewSurface: 'surface',
  previewKind: 'login',
};

const LOGIN_LOGO_SECTIONS: LogoSectionConfig[] = [
  {
    variant: 'login',
    label: 'Modo claro',
    hint: 'Logo a color sobre fondo claro.',
    previewSurface: 'surface',
    previewKind: 'login',
  },
  {
    variant: 'dark',
    label: 'Modo oscuro',
    hint: 'Logo blanco sobre fondo oscuro.',
    previewSurface: 'dark',
    previewKind: 'login',
  },
];

function syncLogoState() {
  return {
    urls: {
      login: getAppLogoUrl('login'),
      dark: getAppLogoUrl('dark'),
      onAccent: getAppLogoUrl('onAccent'),
      light: getAppLogoUrl('light'),
    },
    custom: {
      login: hasCustomAppLogo('login'),
      dark: hasCustomAppLogo('dark'),
      onAccent: hasCustomAppLogo('onAccent'),
      light: hasCustomAppLogo('light'),
    },
  };
}

function syncFaviconState() {
  return {
    url: getAppFaviconUrl(),
    custom: hasCustomAppFavicon(),
  };
}

type LogoSettingCardProps = {
  label: string;
  hint: string;
  src: string;
  hasCustom: boolean;
  previewSurface: LogoPreviewSurface;
  previewKind: LogoSectionConfig['previewKind'];
  accentColor: string;
  logoSize: AppLogoSize;
  layout?: 'card' | 'column';
  showSizeControl?: boolean;
  onLogoSizeChange?: (size: AppLogoSize) => void;
  onUpload: (file: File | undefined) => void;
  onReset: () => void;
};

function LogoSettingCard({
  label,
  hint,
  src,
  hasCustom,
  previewSurface,
  previewKind,
  accentColor,
  logoSize,
  layout = 'card',
  showSizeControl = false,
  onLogoSizeChange,
  onUpload,
  onReset,
}: LogoSettingCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isColumn = layout === 'column';
  const Root = isColumn ? 'div' : 'section';

  const previewClassName = cx(
    styles.logoPreview,
    previewSurface === 'accent' && styles.logoPreviewAccent,
    previewSurface === 'dark' && styles.logoPreviewDark,
  );

  const imageClassName = cx(
    styles.logoPreviewImage,
    previewKind === 'wordmark' && styles.logoPreviewWordmarkImage,
    previewKind === 'login' && styles.logoPreviewLoginImage,
    previewKind === 'icon' && styles.logoPreviewIconImage,
  );

  const imageStyle: CSSProperties =
    previewKind === 'wordmark' ? { height: APP_LOGO_WORDMARK_HEIGHTS[logoSize] } : undefined;

  return (
    <Root
      className={isColumn ? styles.logoLoginColumn : styles.logoCard}
      aria-label={label}
    >
      <div className={styles.logoCardHeader}>
        <p className={styles.logoCardLabel}>{label}</p>
        <p className={styles.logoCardHint}>{hint}</p>
      </div>

      <div
        className={previewClassName}
        style={previewSurface === 'accent' ? { background: accentColor } : undefined}
      >
        <img src={src} alt="" className={imageClassName} style={imageStyle} />
      </div>

      <div className={styles.logoActions}>
        <button
          type="button"
          className={ui.btnSecondary}
          onClick={() => inputRef.current?.click()}
        >
          Cambiar logo
        </button>
        {hasCustom && (
          <button type="button" className={ui.btnSecondary} onClick={onReset}>
            Restablecer
          </button>
        )}
      </div>

      {showSizeControl && onLogoSizeChange && (
        <div className={styles.logoSizeControl}>
          <p className={styles.logoSizeControlLabel}>Tamaño del logo en sidebar</p>
          <p className={styles.logoCardHint}>
            Afecta al wordmark del sidebar expandido y colapsado.
          </p>
          <div className={ui.flexRow}>
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                type="button"
                className={cx(ui.btnToggle, logoSize === size && ui.btnToggleActive)}
                onClick={() => onLogoSizeChange(size)}
              >
                {APP_LOGO_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={(event) => {
          onUpload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </Root>
  );
}

type LoginLogoSettingSectionProps = {
  sections: LogoSectionConfig[];
  logos: ReturnType<typeof syncLogoState>;
  accentColor: string;
  onUpload: (variant: AppLogoVariant, file: File | undefined) => void;
  onReset: (variant: AppLogoVariant) => void;
};

function LoginLogoSettingSection({
  sections,
  logos,
  accentColor,
  onUpload,
  onReset,
}: LoginLogoSettingSectionProps) {
  return (
    <section className={styles.logoCard} aria-label="Wordmark login">
      <div className={styles.logoCardHeader}>
        <p className={styles.logoCardLabel}>Wordmark login</p>
        <p className={styles.logoCardHint}>
          Pantalla de login en tema claro y oscuro. El topbar movil usa la variante de cada
          modo.
        </p>
      </div>

      <div className={styles.logoGrid}>
        {sections.map((section) => (
          <LogoSettingCard
            key={section.variant}
            layout="column"
            label={section.label}
            hint={section.hint}
            src={logos.urls[section.variant]}
            hasCustom={logos.custom[section.variant]}
            previewSurface={section.previewSurface}
            previewKind={section.previewKind}
            accentColor={accentColor}
            logoSize="md"
            onUpload={(file) => {
              onUpload(section.variant, file);
            }}
            onReset={() => {
              onReset(section.variant);
            }}
          />
        ))}
      </div>
    </section>
  );
}

export default function AppearanceSettings() {
  const [color, setColor] = useState(getAppAccentColor);
  const { colorScheme, setThemePreference } = useTheme();
  const [logos, setLogos] = useState(syncLogoState);
  const [logoSize, setLogoSize] = useState(getAppLogoSize);
  const [favicon, setFavicon] = useState(syncFaviconState);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!readLocalStorageFor('appAccent')) {
      setAppAccentColor(DEFAULT_APP_ACCENT);
    }
    setColor(getAppAccentColor());

    const syncColor = () => setColor(getAppAccentColor());
    window.addEventListener(APP_EVENTS.appAccentUpdated, syncColor);
    return () => window.removeEventListener(APP_EVENTS.appAccentUpdated, syncColor);
  }, []);

  useEffect(() => {
    const syncLogos = () => setLogos(syncLogoState());
    window.addEventListener(APP_EVENTS.appLogoUpdated, syncLogos);
    return () => window.removeEventListener(APP_EVENTS.appLogoUpdated, syncLogos);
  }, []);

  useEffect(() => {
    const syncLogoSize = () => setLogoSize(getAppLogoSize());
    window.addEventListener(APP_EVENTS.appLogoSizeUpdated, syncLogoSize);
    return () => window.removeEventListener(APP_EVENTS.appLogoSizeUpdated, syncLogoSize);
  }, []);

  useEffect(() => {
    const syncFavicon = () => setFavicon(syncFaviconState());
    window.addEventListener(APP_EVENTS.appFaviconUpdated, syncFavicon);
    return () => window.removeEventListener(APP_EVENTS.appFaviconUpdated, syncFavicon);
  }, []);

  const isCorporateColor = color.trim().toLowerCase() === DEFAULT_APP_ACCENT;

  const handleColorChange = (nextColor: string) => {
    setColor(nextColor);
    setAppAccentColor(nextColor);
  };

  const handleRestoreCorporateColor = () => {
    resetAppAccentColor();
    setColor(DEFAULT_APP_ACCENT);
  };

  const handleLogoUpload = async (variant: AppLogoVariant, file: File | undefined) => {
    if (!file) return;

    setLogoError(null);
    try {
      const dataUrl = await readLogoFile(file);
      setAppLogo(variant, dataUrl);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'No se pudo cargar el logo.');
    }
  };

  const handleLogoReset = (variant: AppLogoVariant) => {
    setLogoError(null);
    resetAppLogo(variant);
  };

  const handleLogoSizeChange = (nextSize: AppLogoSize) => {
    setLogoSize(nextSize);
    setAppLogoSize(nextSize);
  };

  const handleFaviconUpload = async (file: File | undefined) => {
    if (!file) return;

    setFaviconError(null);
    try {
      const dataUrl = await readFaviconFile(file);
      setAppFavicon(dataUrl);
    } catch (err) {
      setFaviconError(err instanceof Error ? err.message : 'No se pudo cargar el favicon.');
    }
  };

  const handleFaviconReset = () => {
    setFaviconError(null);
    resetAppFavicon();
  };

  return (
    <div className={styles.wrap}>
      <section className={ui.pageSection} aria-labelledby="appearance-theme-title">
        <h2 id="appearance-theme-title" className={ui.pageSectionTitle}>
          Tema
        </h2>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className={ui.flexRow}>
              <button
                type="button"
                className={cx(ui.btnToggle, colorScheme === 'light' && ui.btnToggleActive)}
                onClick={() => setThemePreference('light')}
              >
                {'\u2600\ufe0f'} Claro
              </button>
              <button
                type="button"
                className={cx(ui.btnToggle, colorScheme === 'dark' && ui.btnToggleActive)}
                onClick={() => setThemePreference('dark')}
              >
                {'\u{1F319}'} Oscuro
              </button>
            </div>
          </div>
        </div>
      </section>

      <WorkspaceTypographySettings />

      <section className={ui.pageSection} aria-labelledby="appearance-color-title">
        <h2 id="appearance-color-title" className={ui.pageSectionTitle}>
          Color
        </h2>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className={styles.accentColorSection}>
              <ColorPicker
                value={color}
                onChange={handleColorChange}
                presets={APP_ACCENT_COLOR_PRESETS}
                defaultColor={DEFAULT_APP_ACCENT}
              />
              {!isCorporateColor && (
                <button
                  type="button"
                  className={ui.btnSecondary}
                  onClick={handleRestoreCorporateColor}
                >
                  Restaurar color corporativo
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={ui.pageSection} aria-labelledby="appearance-logo-title">
        <h2 id="appearance-logo-title" className={ui.pageSectionTitle}>
          Logotipo
        </h2>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <div className={styles.logoSection}>
              <p className={styles.logoSectionHint}>
                Cada variante del logo tiene su propia seccion. Puedes subir una imagen
                personalizada o restablecer la predeterminada.
              </p>

              <div className={styles.logoSectionsStack}>
                <LogoSettingCard
                  label={SIDEBAR_LOGO_SECTION.label}
                  hint={SIDEBAR_LOGO_SECTION.hint}
                  src={logos.urls[SIDEBAR_LOGO_SECTION.variant]}
                  hasCustom={logos.custom[SIDEBAR_LOGO_SECTION.variant]}
                  previewSurface={SIDEBAR_LOGO_SECTION.previewSurface}
                  previewKind={SIDEBAR_LOGO_SECTION.previewKind}
                  accentColor={color}
                  logoSize={logoSize}
                  showSizeControl
                  onLogoSizeChange={handleLogoSizeChange}
                  onUpload={(file) => {
                    void handleLogoUpload(SIDEBAR_LOGO_SECTION.variant, file);
                  }}
                  onReset={() => handleLogoReset(SIDEBAR_LOGO_SECTION.variant)}
                />

                <LoginLogoSettingSection
                  sections={LOGIN_LOGO_SECTIONS}
                  logos={logos}
                  accentColor={color}
                  onUpload={(variant, file) => {
                    void handleLogoUpload(variant, file);
                  }}
                  onReset={handleLogoReset}
                />

                <LogoSettingCard
                  label={LOADING_LOGO_SECTION.label}
                  hint={LOADING_LOGO_SECTION.hint}
                  src={logos.urls[LOADING_LOGO_SECTION.variant]}
                  hasCustom={logos.custom[LOADING_LOGO_SECTION.variant]}
                  previewSurface={LOADING_LOGO_SECTION.previewSurface}
                  previewKind={LOADING_LOGO_SECTION.previewKind}
                  accentColor={color}
                  logoSize={logoSize}
                  onUpload={(file) => {
                    void handleLogoUpload(LOADING_LOGO_SECTION.variant, file);
                  }}
                  onReset={() => handleLogoReset(LOADING_LOGO_SECTION.variant)}
                />

                <section className={styles.logoCard} aria-labelledby="appearance-favicon-title">
                  <div className={styles.logoCardHeader}>
                    <p id="appearance-favicon-title" className={styles.logoCardLabel}>
                      Favicon
                    </p>
                    <p className={styles.logoCardHint}>
                      Icono de la pestaña del navegador. Recomendado cuadrado, minimo 32x32 px.
                    </p>
                  </div>

                  <div className={styles.faviconPreview}>
                    <img src={favicon.url} alt="" className={styles.faviconPreviewImage} />
                  </div>

                  <div className={styles.logoActions}>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      onClick={() => faviconInputRef.current?.click()}
                    >
                      Cambiar favicon
                    </button>
                    {favicon.custom && (
                      <button
                        type="button"
                        className={ui.btnSecondary}
                        onClick={handleFaviconReset}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>

                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      void handleFaviconUpload(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />

                  {faviconError && <p className={styles.logoError}>{faviconError}</p>}
                </section>
              </div>

              {logoError && <p className={styles.logoError}>{logoError}</p>}
            </div>
          </div>
        </div>
      </section>

      <LoginBackgroundGallerySettings />
    </div>
  );
}
