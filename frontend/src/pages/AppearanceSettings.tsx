import { useEffect, useRef, useState } from 'react';
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
  APP_LOGO_SIZE_DIMENSIONS,
  APP_LOGO_SIZE_LABELS,
  type AppLogoSize,
  type AppLogoVariant,
} from '@/lib/appLogo';
import ColorPicker from '@/components/ColorPicker';
import {
  APP_ACCENT_COLOR_PRESETS,
  getAppAccentColor,
  setAppAccentColor,
} from '@/lib/appTheme';
import { readFaviconFile, readLogoFile } from '@/lib/logoImage';
import { useTheme } from '@/context/ThemeContext';
import LoginBackgroundGallerySettings from '@/components/LoginBackgroundGallerySettings';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './AppearanceSettings.module.css';

function syncLogoState() {
  return {
    light: getAppLogoUrl('light'),
    dark: getAppLogoUrl('dark'),
    onAccent: getAppLogoUrl('onAccent'),
    customLight: hasCustomAppLogo('light'),
    customDark: hasCustomAppLogo('dark'),
    customOnAccent: hasCustomAppLogo('onAccent'),
  };
}

function syncFaviconState() {
  return {
    url: getAppFaviconUrl(),
    custom: hasCustomAppFavicon(),
  };
}

export default function AppearanceSettings() {
  const [color, setColor] = useState(getAppAccentColor);
  const { colorScheme, setThemePreference } = useTheme();
  const [logos, setLogos] = useState(syncLogoState);
  const [logoSize, setLogoSize] = useState(getAppLogoSize);
  const [favicon, setFavicon] = useState(syncFaviconState);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);
  const onAccentInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  const handleColorChange = (nextColor: string) => {
    setColor(nextColor);
    setAppAccentColor(nextColor);
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

      <section className={ui.pageSection} aria-labelledby="appearance-color-title">
        <h2 id="appearance-color-title" className={ui.pageSectionTitle}>
          Color
        </h2>
        <div className={ui.card}>
          <div className={ui.cardBody}>
            <ColorPicker
              value={color}
              onChange={handleColorChange}
              presets={APP_ACCENT_COLOR_PRESETS}
              allowCustom={false}
            />
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
                Solo el pájaro, sin texto. El logo original (blanco sobre fondo transparente) se
                muestra en el sidebar. En login y otras pantallas se usan las variantes claro y
                oscuro.
              </p>

              <div className={styles.logoCard}>
                <p className={styles.logoCardLabel}>Logo original (sidebar)</p>
                <div
                  className={cx(styles.logoPreview, styles.logoPreviewAccent)}
                  style={{ background: color }}
                >
                  <img
                    src={logos.onAccent}
                    alt=""
                    className={styles.logoPreviewImage}
                    style={{ maxHeight: APP_LOGO_SIZE_DIMENSIONS[logoSize] }}
                  />
                </div>
                <div className={styles.logoActions}>
                  <button
                    type="button"
                    className={ui.btnSecondary}
                    onClick={() => onAccentInputRef.current?.click()}
                  >
                    Cambiar logo
                  </button>
                  {logos.customOnAccent && (
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      onClick={() => handleLogoReset('onAccent')}
                    >
                      Restablecer
                    </button>
                  )}
                </div>
                <input
                  ref={onAccentInputRef}
                  type="file"
                  accept="image/*"
                  className={styles.hiddenInput}
                  onChange={(event) => {
                    void handleLogoUpload('onAccent', event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>

              <div className={ui.field}>
                <label className={ui.label}>Tamaño del logo</label>
                <div className={ui.flexRow}>
                  {(['sm', 'md', 'lg'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cx(ui.btnToggle, logoSize === size && ui.btnToggleActive)}
                      onClick={() => handleLogoSizeChange(size)}
                    >
                      {APP_LOGO_SIZE_LABELS[size]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.logoGrid}>
                <div className={styles.logoCard}>
                  <p className={styles.logoCardLabel}>Modo claro</p>
                  <div className={styles.logoPreview}>
                    <img
                      src={logos.light}
                      alt=""
                      className={styles.logoPreviewImage}
                      style={{ maxHeight: APP_LOGO_SIZE_DIMENSIONS[logoSize] }}
                    />
                  </div>
                  <div className={styles.logoActions}>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      onClick={() => lightInputRef.current?.click()}
                    >
                      Cambiar logo
                    </button>
                    {logos.customLight && (
                      <button
                        type="button"
                        className={ui.btnSecondary}
                        onClick={() => handleLogoReset('light')}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                  <input
                    ref={lightInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      void handleLogoUpload('light', event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </div>

                <div className={styles.logoCard}>
                  <p className={styles.logoCardLabel}>Modo oscuro</p>
                  <div className={cx(styles.logoPreview, styles.logoPreviewDark)}>
                    <img
                      src={logos.dark}
                      alt=""
                      className={styles.logoPreviewImage}
                      style={{ maxHeight: APP_LOGO_SIZE_DIMENSIONS[logoSize] }}
                    />
                  </div>
                  <div className={styles.logoActions}>
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      onClick={() => darkInputRef.current?.click()}
                    >
                      Cambiar logo
                    </button>
                    {logos.customDark && (
                      <button
                        type="button"
                        className={ui.btnSecondary}
                        onClick={() => handleLogoReset('dark')}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                  <input
                    ref={darkInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      void handleLogoUpload('dark', event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </div>
              </div>

              {logoError && <p className={styles.logoError}>{logoError}</p>}

              <div className={styles.faviconBlock}>
                <div className={ui.field}>
                  <label className={ui.label}>Favicon</label>
                  <p className={styles.logoSectionHint}>
                    Icono de la pestaña del navegador. Recomendado cuadrado, mínimo 32×32 px.
                  </p>
                </div>

                <div className={styles.faviconCard}>
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
                </div>

                {faviconError && <p className={styles.logoError}>{faviconError}</p>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <LoginBackgroundGallerySettings />
    </div>
  );
}
