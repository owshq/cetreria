// Preparatory AEAT core. Not wired to submit flow yet.
// Golden tests validan estabilidad tecnica; no sustituyen cumplimiento legal AEAT.

import { createHash } from 'node:crypto';
import type { VerifactuCanonicalPayload } from './verifactuPayload.js';

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

/**
 * Serializacion estable del payload para entrada de hash normativo.
 * Claves ordenadas lexicograficamente en todos los niveles.
 */
export function canonicalizePayloadForHash(payload: VerifactuCanonicalPayload): string {
  return stableStringify(payload);
}

/**
 * Huella SHA-256 (64 hex minusculas) sobre el payload canonico.
 * Preparatorio para integracion AEAT; no sustituye el hash sandbox actual.
 */
export function buildSha256Hash(payload: VerifactuCanonicalPayload): string {
  const canonical = canonicalizePayloadForHash(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_RE.test(value);
}
