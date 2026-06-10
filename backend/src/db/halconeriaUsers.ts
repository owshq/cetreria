import type { User } from '@shared/types';

/** Cuentas del workspace de halconería (Fauna y Halconeros). */
export const HALCONERIA_USER_SPECS = [
  {
    key: 'admin',
    name: 'Admin',
    email: 'admin@faunayhalconeros.com',
    password: 'admin123',
    role: 'admin' as const,
  },
  {
    key: 'sara',
    name: 'Sara',
    email: 'sara@faunayhalconeros.com',
    password: 'sara123',
    role: 'user' as const,
    roleLabel: 'Operario',
  },
  {
    key: 'raul',
    name: 'Raul',
    email: 'raul@faunayhalconeros.com',
    password: 'raul123',
    role: 'user' as const,
    roleLabel: 'Operario',
  },
  {
    key: 'joseCristobal',
    name: 'Jose Cristobal',
    email: 'josecristobal@faunayhalconeros.com',
    password: 'josecristobal123',
    role: 'user' as const,
    roleLabel: 'Operario',
  },
  {
    key: 'juan',
    name: 'Juan',
    email: 'juan@faunayhalconeros.com',
    password: 'juan123',
    role: 'user' as const,
    roleLabel: 'Operario',
  },
] as const;

export type HalconeriaUserKey = (typeof HALCONERIA_USER_SPECS)[number]['key'];

export function halconeriaUserSpec(key: HalconeriaUserKey) {
  return HALCONERIA_USER_SPECS.find((spec) => spec.key === key)!;
}

export function toSeedUser(
  id: string,
  spec: (typeof HALCONERIA_USER_SPECS)[number],
): User {
  return {
    id,
    name: spec.name,
    email: spec.email,
    role: spec.role,
    password: spec.password,
    ...(spec.role === 'user' && spec.roleLabel ? { roleLabel: spec.roleLabel } : {}),
  };
}
