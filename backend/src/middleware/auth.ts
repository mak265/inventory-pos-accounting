import { Request, Response, NextFunction } from 'express'
import { verifyToken, JWTPayload } from '../utils/jwt.js'
import { verifyAdminPassword } from '../controllers/authController.js'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Allow CORS preflight requests to pass through without authentication
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' })
      return
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    try {
      const decoded = verifyToken(token)
      req.user = decoded
      next()
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' })
    return
  }
}

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    next()
  }
}

/**
 * Middleware that verifies admin password from request body.
 * Expects { adminPassword: string } in the request body.
 * Returns 403 if password is missing or incorrect.
 */
export const requireAdminPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { adminPassword } = req.body

    if (!adminPassword) {
      res.status(403).json({ error: 'Admin password required for delete operation' })
      return
    }

    const isValid = await verifyAdminPassword(adminPassword)

    if (!isValid) {
      console.warn(
        `Failed admin password attempt by user: ${req.user?.userId || 'unknown'} at ${new Date().toISOString()}`
      )
      res.status(403).json({ error: 'Invalid admin password' })
      return
    }

    next()
  } catch (error) {
    console.error('Admin password verification error:', error)
    res.status(500).json({ error: 'Admin verification failed' })
  }
}
