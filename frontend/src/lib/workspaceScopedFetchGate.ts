/** Solo fetch de settings privados por workspace cuando hay sesion y workspace activo. */
export function shouldFetchWorkspaceScopedSettings(
  isAuthenticated: boolean,
  workspaceId: string | null | undefined,
): boolean {
  return isAuthenticated && typeof workspaceId === 'string' && workspaceId.length > 0;
}
