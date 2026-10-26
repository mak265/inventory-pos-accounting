import { User, IUser } from '../models/User.js'

/**
 * List users with optional search and role filters.
 * Excludes passwordHash from results.
 */
export const listUsers = async (
  search?: string,
  role?: string
): Promise<IUser[]> => {
  const query: Record<string, unknown> = {}

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = [
      { username: { $regex: escapedSearch, $options: 'i' } },
      { fullName: { $regex: escapedSearch, $options: 'i' } },
    ]
  }

  if (role) {
    query.role = role
  }

  const users = await User.find(query).select('-passwordHash').sort({ username: 1 })
  return users
}

/**
 * Create a new user after validating input.
 * Sets passwordHash to the plain password — the User model's pre-save hook will hash it.
 */
export const createUser = async (data: {
  username: string
  password: string
  fullName: string
  role?: 'ADMIN' | 'CASHIER' | 'MANAGER' | 'VIEWER'
}): Promise<IUser> => {
  // Validate username format
  if (!/^[a-z0-9]{3,30}$/.test(data.username)) {
    throw new Error(
      'Username must be 3-30 characters long and contain only lowercase letters and numbers'
    )
  }

  // Validate password length
  if (!data.password || data.password.length < 6) {
    throw new Error('Password must be at least 6 characters long')
  }

  // Validate fullName length
  if (!data.fullName || data.fullName.length < 2 || data.fullName.length > 100) {
    throw new Error('Full name must be between 2 and 100 characters long')
  }

  // Check username uniqueness
  const existing = await User.findOne({ username: data.username })
  if (existing) {
    throw new Error('Username already exists')
  }

  const user = await User.create({
    username: data.username,
    passwordHash: data.password,
    fullName: data.fullName,
    role: data.role || 'CASHIER',
  })

  return user
}

/**
 * Update a user's fullName, role, isActive, and optionally password.
 * Uses findById + save to trigger the pre-save hash hook when password changes.
 */
export const updateUser = async (
  id: string,
  data: {
    fullName?: string
    role?: 'ADMIN' | 'CASHIER' | 'MANAGER' | 'VIEWER'
    isActive?: boolean
    password?: string
  }
): Promise<IUser> => {
  const user = await User.findById(id)
  if (!user) {
    throw new Error('User not found')
  }

  if (data.fullName !== undefined) {
    user.fullName = data.fullName
  }

  if (data.role !== undefined) {
    user.role = data.role
  }

  if (data.isActive !== undefined) {
    user.isActive = data.isActive
  }

  // Only update password if provided and non-empty
  if (data.password && data.password.length > 0) {
    user.passwordHash = data.password
  }

  await user.save()
  return user
}

/**
 * Delete a user by ID. Prevents self-deletion.
 */
export const deleteUser = async (
  id: string,
  requestingUserId: string
): Promise<void> => {
  if (id === requestingUserId) {
    throw new Error('Cannot delete your own account')
  }

  const user = await User.findById(id)
  if (!user) {
    throw new Error('User not found')
  }

  await User.findByIdAndDelete(id)
}
