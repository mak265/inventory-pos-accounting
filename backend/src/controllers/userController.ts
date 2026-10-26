import { Request, Response } from 'express'
import {
  listUsers as listUsersService,
  createUser as createUserService,
  updateUser as updateUserService,
  deleteUser as deleteUserService,
} from '../services/userService.js'

export const listUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const search = req.query.search as string | undefined
    const role = req.query.role as string | undefined
    const users = await listUsersService(search, role)
    res.status(200).json(users)
  } catch (error) {
    console.error('List users error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { username, password, fullName, role } = req.body
    const user = await createUserService({ username, password, fullName, role })
    res.status(201).json(user)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message === 'Username already exists') {
      res.status(409).json({ error: message })
      return
    }
    if (
      message.includes('Username must be') ||
      message.includes('Password must be') ||
      message.includes('Full name must be')
    ) {
      res.status(400).json({ error: message })
      return
    }
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const { fullName, role, isActive, password } = req.body
    const user = await updateUserService(id, { fullName, role, isActive, password })
    res.status(200).json(user)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message === 'User not found') {
      res.status(404).json({ error: message })
      return
    }
    if (
      message.includes('Username must be') ||
      message.includes('Password must be') ||
      message.includes('Full name must be')
    ) {
      res.status(400).json({ error: message })
      return
    }
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params

    // Prevent self-deletion
    if (req.user?.userId === id) {
      res.status(400).json({ error: 'Cannot delete your own account' })
      return
    }

    await deleteUserService(id, req.user!.userId)
    res.status(200).json({ message: 'User deleted successfully' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message === 'User not found') {
      res.status(404).json({ error: message })
      return
    }
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
