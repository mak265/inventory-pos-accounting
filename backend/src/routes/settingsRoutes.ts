import express, { Request, Response, NextFunction } from 'express'
import multer, { MulterError } from 'multer'
import fs from 'fs'
import path from 'path'
import { authenticate, authorize } from '../middleware/auth.js'
import * as settingsController from '../controllers/settingsController.js'

const router = express.Router()

// Ensure uploads/logos directory exists
const logoDir = 'uploads/logos/'
fs.mkdirSync(logoDir, { recursive: true })

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, logoDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1)
    cb(null, `logo-${Date.now()}.${ext}`)
  },
})

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Logo must be a PNG, JPEG, or SVG image'))
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
})

// Routes
router.get('/', settingsController.getSettings)
router.put('/', authenticate, authorize('ADMIN'), settingsController.updateSettings)
router.post(
  '/logo',
  authenticate,
  authorize('ADMIN'),
  upload.single('logo'),
  settingsController.uploadLogo
)

// Multer error handling middleware
router.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Logo file size must not exceed 2 MB' })
    return
  }
  if (err.message === 'Logo must be a PNG, JPEG, or SVG image') {
    res.status(400).json({ error: 'Logo must be a PNG, JPEG, or SVG image' })
    return
  }
  next(err)
})

export default router
