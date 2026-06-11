import { useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '@/api';
import { APP_EVENTS } from '@/lib/appEvents';
import type { User } from '@shared/types';
import { getUserRoleLabel } from '@shared/types';
import { readAvatarFile } from '@/lib/avatarImage';
import { useTheme } from '@/context/ThemeContext';
import { cx } from '@/lib/cx';
import { Input, PasswordField } from '@/components/forms';
import { PasswordLockIcon } from '@/components/icons/PasswordLockIcon';
import ui from '@/styles/shared.module.css';
import UserAvatar from '@/components/UserAvatar';
import styles from './ProfileSettings.module.css';

type SectionKey = 'avatar' | 'data' | 'password';

type SectionFeedback = {
  error: string | null;
  success: string | null;
};

const emptyFeedback = (): SectionFeedback => ({ error: null, success: null });

function ProfilePasswordField({
  id,
  label,
  value,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: 'current-password' | 'new-password';
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <PasswordField
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        trailing={
          <button
            type="button"
            className={ui.passwordToggle}
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            <PasswordLockIcon unlocked={visible} />
          </button>
        }
      />
    </div>
  );
}

function SectionSaveFooter({
  saving,
  dirty,
  error,
  success,
}: {
  saving: boolean;
  dirty: boolean;
  error: string | null;
  success: string | null;
}) {
  const showSave = dirty || saving;
  if (!showSave && !error && !success) return null;

  return (
    <div className={styles.sectionFooter}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          {success}
        </p>
      )}
      {showSave && (
        <div className={styles.actions}>
          <button type="submit" className={ui.btnPrimary} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfileSettings() {
  const currentUser = authService.getCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: currentUser?.name ?? '',
    email: currentUser?.email ?? '',
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });
  const [savedName, setSavedName] = useState(currentUser?.name ?? '');
  const [savedEmail, setSavedEmail] = useState(currentUser?.email ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl ?? '');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState(currentUser?.avatarUrl ?? '');
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [feedback, setFeedback] = useState<Record<SectionKey, SectionFeedback>>({
    avatar: emptyFeedback(),
    data: emptyFeedback(),
    password: emptyFeedback(),
  });

  const avatarDirty = useMemo(() => {
    if (avatarRemoved) return Boolean(savedAvatarUrl);
    return avatarUrl !== savedAvatarUrl;
  }, [avatarRemoved, avatarUrl, savedAvatarUrl]);

  const dataDirty = useMemo(() => {
    const name = formData.name.trim();
    const email = formData.email.trim();
    return name !== savedName || email !== savedEmail;
  }, [formData.name, formData.email, savedName, savedEmail]);

  const passwordDirty = useMemo(
    () =>
      Boolean(
        formData.currentPassword || formData.password || formData.confirmPassword,
      ),
    [formData.currentPassword, formData.password, formData.confirmPassword],
  );

  useEffect(() => {
    const syncFromUser = (user: Omit<User, 'password'>) => {
      setFormData((current) => ({
        ...current,
        name: user.name,
        email: user.email,
      }));
      setSavedName(user.name);
      setSavedEmail(user.email);
      setAvatarUrl(user.avatarUrl ?? '');
      setSavedAvatarUrl(user.avatarUrl ?? '');
      setAvatarRemoved(false);
    };

    const onUserUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Omit<User, 'password'>>).detail;
      if (detail) syncFromUser(detail);
    };

    window.addEventListener(APP_EVENTS.userUpdated, onUserUpdated);
    return () => window.removeEventListener(APP_EVENTS.userUpdated, onUserUpdated);
  }, []);

  const { colorScheme, setThemePreference } = useTheme();

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin';

  const setSectionFeedback = (section: SectionKey, next: Partial<SectionFeedback>) => {
    setFeedback((current) => ({
      ...current,
      [section]: { ...current[section], ...next },
    }));
  };

  const handleAvatarChange = async (file: File | undefined) => {
    if (!file) return;

    setSectionFeedback('avatar', { error: null, success: null });
    try {
      const nextAvatar = await readAvatarFile(file);
      setAvatarUrl(nextAvatar);
      setAvatarRemoved(false);
    } catch (err) {
      setSectionFeedback('avatar', {
        error: err instanceof Error ? err.message : 'No se pudo cargar la imagen.',
        success: null,
      });
    }
  };

  const handleSaveAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarDirty || savingSection) return;

    setSavingSection('avatar');
    setSectionFeedback('avatar', { error: null, success: null });

    try {
      const updates: { avatarUrl: string | null } = {
        avatarUrl: avatarRemoved ? null : avatarUrl || null,
      };
      const updatedUser = await authService.updateProfile(updates);
      const nextAvatar = updatedUser.avatarUrl ?? '';
      setAvatarUrl(nextAvatar);
      setSavedAvatarUrl(nextAvatar);
      setAvatarRemoved(false);
      setSectionFeedback('avatar', {
        error: null,
        success: 'Foto de perfil actualizada.',
      });
    } catch (err) {
      setSectionFeedback('avatar', {
        error: err instanceof Error ? err.message : 'No se pudo guardar la foto.',
        success: null,
      });
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataDirty || savingSection) return;

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();

    if (!name) {
      setSectionFeedback('data', { error: 'El nombre es obligatorio.', success: null });
      return;
    }

    if (!email) {
      setSectionFeedback('data', { error: 'El email es obligatorio.', success: null });
      return;
    }

    setSavingSection('data');
    setSectionFeedback('data', { error: null, success: null });

    try {
      const updatedUser = await authService.updateProfile({ name, email });
      setFormData((current) => ({
        ...current,
        name: updatedUser.name,
        email: updatedUser.email,
      }));
      setSavedName(updatedUser.name);
      setSavedEmail(updatedUser.email);
      setSectionFeedback('data', {
        error: null,
        success: 'Datos personales actualizados.',
      });
    } catch (err) {
      setSectionFeedback('data', {
        error: err instanceof Error ? err.message : 'No se pudieron guardar los datos.',
        success: null,
      });
    } finally {
      setSavingSection(null);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSection) return;

    if (!formData.password) {
      setSectionFeedback('password', {
        error: 'Introduce la nueva contraseña.',
        success: null,
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setSectionFeedback('password', {
        error: 'Las contraseñas nuevas no coinciden.',
        success: null,
      });
      return;
    }

    if (!formData.currentPassword) {
      setSectionFeedback('password', {
        error: 'Introduce tu contraseña actual para cambiarla.',
        success: null,
      });
      return;
    }

    setSavingSection('password');
    setSectionFeedback('password', { error: null, success: null });

    try {
      await authService.updateProfile({
        password: formData.password,
        currentPassword: formData.currentPassword,
      });
      setFormData((current) => ({
        ...current,
        currentPassword: '',
        password: '',
        confirmPassword: '',
      }));
      setSectionFeedback('password', {
        error: null,
        success: 'Contraseña actualizada.',
      });
    } catch (err) {
      setSectionFeedback('password', {
        error: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.',
        success: null,
      });
    } finally {
      setSavingSection(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <section className={ui.pageSection} aria-labelledby="profile-photo-title">
        <h2 id="profile-photo-title" className={ui.pageSectionTitle}>
          Foto de perfil
        </h2>
        <form onSubmit={handleSaveAvatar}>
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className={styles.avatarSection}>
                <UserAvatar
                  user={{
                    name: formData.name || currentUser.name,
                    avatarUrl: avatarRemoved ? undefined : avatarUrl,
                  }}
                  size="lg"
                />
                <div className={styles.avatarActions}>
                  <button
                    type="button"
                    className={cx(ui.btnSecondary, styles.avatarBtn)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📷 Cambiar foto
                  </button>
                  {(avatarUrl || currentUser.avatarUrl) && !avatarRemoved && (
                    <button
                      type="button"
                      className={cx(ui.btnSecondary, styles.avatarBtn)}
                      onClick={() => {
                        setAvatarUrl('');
                        setAvatarRemoved(true);
                        setSectionFeedback('avatar', { error: null, success: null });
                      }}
                    >
                      🗑️ Quitar foto
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      void handleAvatarChange(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <SectionSaveFooter
                saving={savingSection === 'avatar'}
                dirty={avatarDirty}
                error={feedback.avatar.error}
                success={feedback.avatar.success}
              />
            </div>
          </div>
        </form>
      </section>

      <section className={ui.pageSection} aria-labelledby="profile-data-title">
        <h2 id="profile-data-title" className={ui.pageSectionTitle}>
          Datos personales
        </h2>
        <form onSubmit={handleSaveData}>
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className={ui.form}>
                <div className={ui.field}>
                  <label className={ui.label}>Nombre completo *</label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setSectionFeedback('data', { error: null, success: null });
                    }}
                    required
                  />
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Email *</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setSectionFeedback('data', { error: null, success: null });
                    }}
                    required
                  />
                </div>

                <div className={ui.field}>
                  <label className={ui.label}>Rol</label>
                  <Input type="text" value={getUserRoleLabel(currentUser)} disabled />
                </div>
              </div>
              <SectionSaveFooter
                saving={savingSection === 'data'}
                dirty={dataDirty}
                error={feedback.data.error}
                success={feedback.data.success}
              />
            </div>
          </div>
        </form>
      </section>

      <section className={ui.pageSection} aria-labelledby="profile-password-title">
        <h2 id="profile-password-title" className={ui.pageSectionTitle}>
          Contraseña
        </h2>
        <form onSubmit={handleSavePassword}>
          <div className={ui.card}>
            <div className={ui.cardBody}>
              <div className={styles.passwordSection}>
                <p className={styles.sectionHint}>
                  Completa los tres campos para cambiar la contraseña.
                </p>

                <div className={ui.form}>
                  <ProfilePasswordField
                    id="profile-current-password"
                    label="Contraseña actual"
                    value={formData.currentPassword}
                    autoComplete="current-password"
                    onChange={(currentPassword) => {
                      setFormData((current) => ({ ...current, currentPassword }));
                      setSectionFeedback('password', { error: null, success: null });
                    }}
                  />

                  <ProfilePasswordField
                    id="profile-new-password"
                    label="Nueva contraseña"
                    value={formData.password}
                    autoComplete="new-password"
                    onChange={(password) => {
                      setFormData((current) => ({ ...current, password }));
                      setSectionFeedback('password', { error: null, success: null });
                    }}
                  />

                  <ProfilePasswordField
                    id="profile-confirm-password"
                    label="Confirmar nueva contraseña"
                    value={formData.confirmPassword}
                    autoComplete="new-password"
                    onChange={(confirmPassword) => {
                      setFormData((current) => ({ ...current, confirmPassword }));
                      setSectionFeedback('password', { error: null, success: null });
                    }}
                  />
                </div>
              </div>
              <SectionSaveFooter
                saving={savingSection === 'password'}
                dirty={passwordDirty}
                error={feedback.password.error}
                success={feedback.password.success}
              />
            </div>
          </div>
        </form>
      </section>

      {!isAdmin && (
        <section className={ui.pageSection} aria-labelledby="profile-theme-title">
          <h2 id="profile-theme-title" className={ui.pageSectionTitle}>
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
      )}
    </div>
  );
}
