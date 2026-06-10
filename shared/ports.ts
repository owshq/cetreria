/** Host loopback estable en Windows (evita localhost -> ::1 en proxy Vite). */
export const LOOPBACK_HOST = '127.0.0.1';

/** Puertos del stack CRM Cetrería (bloque 3000). */
export const PORTS = {
  frontend: 3000,
  api: 3001,
} as const;

export function apiUrl(port = PORTS.api) {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function frontendUrl(port = PORTS.frontend) {
  return `http://${LOOPBACK_HOST}:${port}`;
}
