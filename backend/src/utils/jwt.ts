import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this'

export interface JWTPayload {
  userId: string
  username: string
  role: string
}

/**
 * Calculate token expiry to last until end of business hours (5:00 PM).
 * If login happens before 5 PM, token expires at 5 PM same day.
 * If login happens after 5 PM, token expires at 5 PM next day.
 * This ensures tokens never expire during working hours (8 AM - 5 PM).
 */
function getExpiryTimestamp(): number {
  const now = new Date()
  const endOfBusiness = new Date(now)
  endOfBusiness.setHours(17, 0, 0, 0) // 5:00 PM today

  if (now >= endOfBusiness) {
    // After 5 PM — expire at 5 PM tomorrow
    endOfBusiness.setDate(endOfBusiness.getDate() + 1)
  }

  return Math.floor(endOfBusiness.getTime() / 1000)
}

export const generateToken = (payload: JWTPayload): string => {
  const exp = getExpiryTimestamp()
  return jwt.sign({ ...payload, exp }, JWT_SECRET)
}

export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch (error) {
    throw new Error('Invalid or expired token')
  }
}

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload
  } catch (error) {
    return null
  }
}
