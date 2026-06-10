import type { User } from './types.js';

export const DEFAULT_USER_ROLE_LABEL = 'Usuario';
export const ADMIN_ROLE_LABEL = 'Administrador';

export function getUserInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function getUserRoleLabel(user: Pick<User, 'role' | 'roleLabel'>): string {
  if (user.role === 'admin') return ADMIN_ROLE_LABEL;
  const trimmed = user.roleLabel?.trim();
  return trimmed || DEFAULT_USER_ROLE_LABEL;
}

export function normalizeUserRoleLabel(
  role: User['role'],
  roleLabel?: string,
): string | undefined {
  if (role === 'admin') return undefined;
  const trimmed = roleLabel?.trim();
  return trimmed || DEFAULT_USER_ROLE_LABEL;
}

/** Contraseñas iniciales de las cuentas de halconería (solo referencia en gestión de usuarios). */
export const HALCONERIA_USER_PASSWORDS_BY_EMAIL: Record<string, string> = {
  'admin@faunayhalconeros.com': 'admin123',
  'sara@faunayhalconeros.com': 'sara123',
  'raul@faunayhalconeros.com': 'raul123',
  'josecristobal@faunayhalconeros.com': 'josecristobal123',
  'juan@faunayhalconeros.com': 'juan123',
};

export function getKnownHalconeriaPassword(email: string): string | null {
  return HALCONERIA_USER_PASSWORDS_BY_EMAIL[email.trim().toLowerCase()] ?? null;
}
