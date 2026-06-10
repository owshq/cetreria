/** IDs fijos para datos de ejemplo (UUID v4 válidos). */
export const SEED_USER_IDS = {
  admin: 'b1000001-0000-4000-8000-000000000001',
  sara: 'b1000002-0000-4000-8000-000000000002',
  raul: 'b1000003-0000-4000-8000-000000000003',
  joseCristobal: 'b1000004-0000-4000-8000-000000000004',
  juan: 'b1000005-0000-4000-8000-000000000005',
} as const;

export const SEED_CLIENT_IDS = {
  industrias: 'c2000001-0000-4000-8000-000000000001',
  comercial: 'c2000002-0000-4000-8000-000000000002',
  almacenes: 'c2000003-0000-4000-8000-000000000003',
} as const;

export const SEED_ACTIVITY_IDS = {
  revision: 'd3000001-0000-4000-8000-000000000001',
  instalacion: 'd3000002-0000-4000-8000-000000000002',
  certificacion: 'd3000003-0000-4000-8000-000000000003',
} as const;

export const SEED_EVENT_IDS = {
  mantenimiento: 'e4000001-0000-4000-8000-000000000001',
  certificacion: 'e4000002-0000-4000-8000-000000000002',
} as const;

export const SEED_DOCUMENT_IDS = {
  factura: 'f5000001-0000-4000-8000-000000000001',
  albaran: 'f5000002-0000-4000-8000-000000000002',
} as const;
