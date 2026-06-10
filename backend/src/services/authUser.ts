import type { User } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getById } from '../db/repository.js';

/** Usuario actual con firma y perfil al día (no solo el JWT). */
export async function getFreshAuthUser(
  userId: string,
): Promise<Omit<User, 'password'> | null> {
  const user = await getById<User>(DB_NAMES.users, userId);
  if (!user) return null;
  const { password: _, ...safe } = user;
  return safe;
}
