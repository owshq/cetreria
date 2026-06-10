export function hasExpandedSecondarySidebar(pathname: string): boolean {
  return (
    pathname === '/activities' ||
    pathname.startsWith('/activities/') ||
    pathname === '/clients' ||
    pathname === '/docs' ||
    pathname.startsWith('/docs/') ||
    pathname === '/reports' ||
    (pathname.startsWith('/reports/') && !pathname.startsWith('/reports/client/')) ||
    pathname === '/settings' ||
    pathname === '/help'
  );
}
