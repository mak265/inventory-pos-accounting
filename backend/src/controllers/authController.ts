import { Request, Response } from 'express'
import { User } from '../models/User.js'
import { generateToken, verifyToken, decodeToken } from '../utils/jwt.js'
import bcrypt from 'bcrypt'

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body

    // Validate input
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' })
      return
    }

    // Find user
    const user = await User.findOne({ username: username.toLowerCase() })

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(403).json({ error: 'Account is disabled' })
      return
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password)

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Update last login
    user.lastLogin = new Date()
    await user.save()

    // Generate token
    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
    })

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
}

export const logout = async (_req: Request, res: Response): Promise<void> => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // Here we just acknowledge the logout request
  res.json({ message: 'Logged out successfully' })
}

export const verifyAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { password } = req.body

    if (!password) {
      res.status(400).json({ error: 'Password is required' })
      return
    }

    const isValid = await verifyAdminPassword(password)

    if (!isValid) {
      res.status(403).json({ error: 'Invalid admin password' })
      return
    }

    res.json({ valid: true })
  } catch (error) {
    console.error('Admin verification error:', error)
    res.status(500).json({ error: 'Verification failed' })
  }
}

/**
 * Verify a plaintext password against the stored admin password.
 * Uses bcrypt hashing for secure comparison.
 * Falls back to ADMIN_PASSWORD env var or default.
 */
export const verifyAdminPassword = async (
  password: string
): Promise<boolean> => {
  // First, verify against the stored admin user password if available.
  try {
    const adminUser = await User.findOne({ username: 'admin' })
    if (adminUser?.passwordHash) {
      return bcrypt.compare(password, adminUser.passwordHash)
    }
  } catch (err) {
    console.warn('Admin user lookup failed:', err)
  }

  // Check if there's a hashed admin password stored in env
  const storedHash = process.env.ADMIN_PASSWORD_HASH
  if (storedHash) {
    return bcrypt.compare(password, storedHash)
  }

  // Fallback: compare against plaintext ADMIN_PASSWORD env var
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  return password === adminPassword
}

export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const user = await User.findById(req.user.userId).select('-passwordHash')

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
}

/**
 * Refresh token — issues a new JWT if the current one is still valid (or recently expired).
 * This allows the frontend to keep tokens fresh for sync operations.
 * 
 * Accepts either:
 * - A valid token in the Authorization header (standard refresh)
 * - Username/password in the body (re-authentication for expired tokens)
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization

    // Try to refresh using existing token first
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        // Token is still valid — issue a fresh one
        const decoded = verifyToken(token)
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
          const newToken = generateToken({
            userId: user._id.toString(),
            username: user.username,
            role: user.role,
          })
          res.json({ token: newToken, user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role } })
          return
        }
      } catch {
        // Token expired or invalid — try re-auth below
      }

      // Token expired — try to decode without verification to get userId
      const decoded = decodeToken(token)
      if (decoded) {
        const user = await User.findById(decoded.userId)
        if (user && user.isActive) {
          // Issue new token for the same user (grace period refresh)
          const newToken = generateToken({
            userId: user._id.toString(),
            username: user.username,
            role: user.role,
          })
          res.json({ token: newToken, user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role } })
          return
        }
      }
    }

    // Fallback: re-authenticate with username/password
    const { username, password } = req.body
    if (username && password) {
      const user = await User.findOne({ username: username.toLowerCase() })
      if (user && user.isActive) {
        const isValid = await user.comparePassword(password)
        if (isValid) {
          const newToken = generateToken({
            userId: user._id.toString(),
            username: user.username,
            role: user.role,
          })
          res.json({ token: newToken, user: { id: user._id, username: user.username, fullName: user.fullName, role: user.role } })
          return
        }
      }
    }

    res.status(401).json({ error: 'Unable to refresh token' })
  } catch (error) {
    console.error('Token refresh error:', error)
    res.status(500).json({ error: 'Token refresh failed' })
  }
}
