import bcrypt from 'bcryptjs';
import type { User, WorkspaceMember } from '@shared/types';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';
import { HALCONERIA_USER_SPECS } from './halconeriaUsers.js';
import { ensureUserWorkspaceMembership } from '../services/workspaces.js';
import { touchDbTransaction, withDbTransaction } from './repository.js';

const OBSOLETE_EMAIL_DOMAIN = '@crm.com';

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

function isObsoleteDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(OBSOLETE_EMAIL_DOMAIN);
}

function needsHalconeriaMigration(users: User[]): boolean {
  const hasObsolete = users.some((user) => isObsoleteDemoEmail(user.email));
  const missingHalconeria = HALCONERIA_USER_SPECS.some(
    (spec) => !users.some((user) => user.email === spec.email),
  );
  return hasObsolete || missingHalconeria;
}

export async function migrateHalconeriaUsers(): Promise<void> {
  const db = await refreshDbFromDisk();
  const users = db.data[DB_NAMES.users] as unknown as User[];
  if (!needsHalconeriaMigration(users)) return;

  await withDbTransaction(async () => {
    let changed = false;
    const removedUserIds = new Set(
      users.filter((user) => isObsoleteDemoEmail(user.email)).map((user) => user.id),
    );

    if (removedUserIds.size > 0) {
      const nextUsers = users.filter((user) => !removedUserIds.has(user.id));
      users.length = 0;
      users.push(...nextUsers);
      changed = true;

      const members = db.data[DB_NAMES.workspaceMembers] as unknown as WorkspaceMember[];
      const nextMembers = members.filter((member) => !removedUserIds.has(member.userId));
      if (nextMembers.length !== members.length) {
        db.data[DB_NAMES.workspaceMembers] =
          nextMembers as unknown as typeof db.data[typeof DB_NAMES.workspaceMembers];
        changed = true;
      }
    }

    const byEmail = new Map(users.map((user) => [user.email, user]));

    for (const spec of HALCONERIA_USER_SPECS) {
      if (byEmail.has(spec.email)) continue;

      const user: User = {
        id: crypto.randomUUID(),
        name: spec.name,
        email: spec.email,
        role: spec.role,
        roleLabel: spec.role === 'user' ? spec.roleLabel : undefined,
        password: await hashPassword(spec.password),
      };
      users.push(user);
      byEmail.set(spec.email, user);
      changed = true;
    }

    if (!changed) return;

    db.data[DB_NAMES.users] = users as unknown as typeof db.data[typeof DB_NAMES.users];

    const members = db.data[DB_NAMES.workspaceMembers] as unknown as WorkspaceMember[];
    for (const user of users.filter((u) =>
      HALCONERIA_USER_SPECS.some((spec) => spec.email === u.email),
    )) {
      const hasMember = members.some(
        (member) =>
          member.workspaceId === DEFAULT_WORKSPACE_ID && member.userId === user.id,
      );
      if (!hasMember) {
        members.push({
          id: crypto.randomUUID(),
          workspaceId: DEFAULT_WORKSPACE_ID,
          userId: user.id,
          role: user.role === 'admin' ? 'owner' : 'member',
          joinedAt: new Date().toISOString(),
        });
        changed = true;
      }
    }
    db.data[DB_NAMES.workspaceMembers] =
      members as unknown as typeof db.data[typeof DB_NAMES.workspaceMembers];

    touchDbTransaction();

    for (const user of users) {
      if (HALCONERIA_USER_SPECS.some((spec) => spec.email === user.email)) {
        await ensureUserWorkspaceMembership(user, DEFAULT_WORKSPACE_ID);
      }
    }
  });

  console.log('Usuarios de halconería (Fauna y Halconeros) aplicados.');
}
