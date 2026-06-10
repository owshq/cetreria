export const DEFAULT_CLIENT_GROUP_NAME = 'Clientes';

export const LEGACY_DEFAULT_CLIENT_GROUP_NAMES = ['contacto', 'cliente', 'clientes'] as const;

/** Qué hacer con los contactos al eliminar un grupo. */
export type DeleteClientGroupContactsAction = 'move_to_all' | 'delete_contacts';
