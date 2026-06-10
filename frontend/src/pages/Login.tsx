import { useState } from 'react';
import { useNavigate } from 'react-router';
import { authService } from '@/api';
import { Moon, Sun } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { PasswordLockIcon } from '@/components/icons/PasswordLockIcon';
import { Input, PasswordField } from '@/components/forms';
import { useTheme } from '@/context/ThemeContext';
import LoginBackgroundGallery from '@/components/LoginBackgroundGallery';
import ui from '@/styles/shared.module.css';
import { HALCONERIA_USER_PASSWORDS_BY_EMAIL } from '@shared/types';

const ADMIN_DEMO_EMAIL = 'admin@faunayhalconeros.com';

const OPERATOR_DEMO_CREDENTIALS = Object.entries(HALCONERIA_USER_PASSWORDS_BY_EMAIL)
  .filter(([email]) => email !== ADMIN_DEMO_EMAIL)
  .sort(([emailA], [emailB]) => emailA.localeCompare(emailB, 'es'));

export default function Login() {
  const navigate = useNavigate();
  const { isDark, toggleColorScheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.login(email.trim().toLowerCase(), password);
      navigate('/home');
    } catch {
      setError('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  const toggleUnlocked = () => {
    setUnlocked((prev) => !prev);
  };

  const themeLabel = isDark ? 'Modo claro' : 'Modo oscuro';

  return (
    <div className={ui.centerPage}>
      <LoginBackgroundGallery />

      <button
        type="button"
        className={ui.loginThemeToggle}
        onClick={toggleColorScheme}
        aria-label={themeLabel}
      >
        {isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
      </button>

      <div className={ui.centerContent}>
        <div className={ui.loginCard}>
          <div className={ui.loginLogoSection}>
            <BrandLogo tone="login" size="lg" />
          </div>

          <div className={ui.loginCardBody}>
            <form onSubmit={handleSubmit} className={ui.form}>
              <div className={ui.field}>
                <label htmlFor="email" className={ui.label}>
                  Email
                </label>
                <Input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Introduzca su correo electrónico"
                  required
                />
              </div>

              <div className={ui.field}>
                <label htmlFor="password" className={ui.label}>
                  Contraseña
                </label>
                <PasswordField
                  type={unlocked ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  trailing={
                    <button
                      type="button"
                      className={ui.passwordToggle}
                      onClick={toggleUnlocked}
                      aria-label={unlocked ? 'Ocultar contraseña y credenciales' : 'Mostrar contraseña y credenciales de prueba'}
                      aria-expanded={unlocked}
                    >
                      <PasswordLockIcon unlocked={unlocked} />
                    </button>
                  }
                />
              </div>

              {error && <div className={ui.alertError}>{error}</div>}

              <button type="submit" className={ui.loginSubmitBtn} disabled={loading}>
                {loading ? 'Entrando...' : 'Iniciar Sesión'}
              </button>
            </form>

            {unlocked && (
              <div className={ui.infoBox}>
                <p className={ui.infoBoxTitle}>Credenciales de prueba:</p>
                <div className={ui.infoBoxList}>
                  <p>
                    <strong>Admin:</strong>{' '}
                    {ADMIN_DEMO_EMAIL} / {HALCONERIA_USER_PASSWORDS_BY_EMAIL[ADMIN_DEMO_EMAIL]}
                  </p>
                  {OPERATOR_DEMO_CREDENTIALS.map(([operatorEmail, operatorPassword]) => (
                    <p key={operatorEmail}>
                      <strong>Operario:</strong> {operatorEmail} / {operatorPassword}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
