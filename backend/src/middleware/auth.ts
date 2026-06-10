import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@shared/types';
import { config } from '../config.js';

/** Claims en el JWT (sin avatar ni firma: evitan cabeceras >8KB y error 431). */
export type JwtClaims = Pick<User, 'id' | 'name' | 'email' | 'role'>;

export type AuthUser = JwtClaims;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function toJwtClaims(user: Pick<User, 'id' | 'name' | 'email' | 'role'>): JwtClaims {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function signToken(user: Pick<User, 'id' | 'name' | 'email' | 'role'>): string {
  return jwt.sign(toJwtClaims(user), config.jwtSecret, { expiresIn: '7d' });
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const decoded = jwt.verify(header.slice(7), config.jwtSecret) as JwtClaims & {
      signatureDataUrl?: string;
      avatarUrl?: string;
    };
    req.user = toJwtClaims(decoded);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }
  next();
}
