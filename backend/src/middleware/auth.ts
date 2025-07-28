import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../models/database';
import { User } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: Omit<User, 'password_hash'>;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ message: 'Access token required' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      res.status(500).json({ message: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: number };
    
    const db = getDatabase();
    const user = await db.get(
      'SELECT id, email, first_name, last_name, phone, role, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
};

export const requireVerified = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !req.user.is_verified) {
    res.status(403).json({ message: 'Email verification required' });
    return;
  }
  next();
};

export const requireRole = (role: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ message: `${role} access required` });
      return;
    }
    next();
  };
};