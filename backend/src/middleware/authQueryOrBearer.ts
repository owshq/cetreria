import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtClaims } from './auth.js';

function readQueryParam(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function resolveBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return readQueryParam(req.query.token);
}

/** Auth por Authorization Bearer o query ?token= (compat WS / polling HTTP). */
export function authQueryOrBearer(req: Request, res: Response, next: NextFunction) {
  const token = resolveBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtClaims & {
      signatureDataUrl?: string;
      avatarUrl?: string;
    };
    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function workspaceFromHeaderOrQuery(req: Request, res: Response, next: NextFunction) {
  const headerValue = req.headers['x-workspace-id'];
  const workspaceId =
    (typeof headerValue === 'string' && headerValue.trim() ? headerValue.trim() : null) ??
    readQueryParam(req.query.workspaceId);

  if (!workspaceId) {
    res.status(400).json({ error: 'Workspace requerido' });
    return;
  }

  req.headers['x-workspace-id'] = workspaceId;
  next();
}
