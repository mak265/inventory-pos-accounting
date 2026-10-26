import { Request, Response } from 'express'
import {
  getOrCreateSettings,
  updateBranding,
  updateLogoUrl,
} from '../services/settingsService.js'

export const getSettings = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const settings = await getOrCreateSettings()
    res.status(200).json(settings)
  } catch (error) {
    console.error('Get settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const updateSettings = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { companyName, tagline } = req.body

    // Validate companyName: required, 1-100 chars
    if (
      companyName !== undefined &&
      (typeof companyName !== 'string' ||
        companyName.length < 1 ||
        companyName.length > 100)
    ) {
      res.status(400).json({
        error: 'Company name must be between 1 and 100 characters',
      })
      return
    }

    // Validate tagline: optional, 0-200 chars
    if (
      tagline !== undefined &&
      (typeof tagline !== 'string' || tagline.length > 200)
    ) {
      res.status(400).json({
        error: 'Tagline must be at most 200 characters',
      })
      return
    }

    const settings = await updateBranding(
      { companyName, tagline },
      req.user!.userId
    )
    res.status(200).json(settings)
  } catch (error) {
    console.error('Update settings error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const uploadLogo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const logoUrl = '/uploads/logos/' + req.file.filename
    const settings = await updateLogoUrl(logoUrl, req.user!.userId)
    res.status(200).json(settings)
  } catch (error) {
    console.error('Upload logo error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
