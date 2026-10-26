import fs from 'fs'
import path from 'path'
import { SystemConfiguration, ISystemConfiguration } from '../models/SystemConfiguration.js'

/**
 * Get the singleton settings document, or create a default one if it doesn't exist.
 */
export const getOrCreateSettings = async (): Promise<ISystemConfiguration> => {
  let settings = await SystemConfiguration.findOne({ key: 'main' })

  if (!settings) {
    settings = await SystemConfiguration.create({
      key: 'main',
      companyName: 'Inventory & POS System',
      logoUrl: '',
      tagline: '',
    })
  }

  return settings
}

/**
 * Update branding fields (companyName, tagline) using upsert to maintain singleton.
 */
export const updateBranding = async (
  data: { companyName?: string; tagline?: string },
  userId: string
): Promise<ISystemConfiguration> => {
  const updateFields: Record<string, unknown> = { updatedBy: userId }

  if (data.companyName !== undefined) {
    updateFields.companyName = data.companyName
  }
  if (data.tagline !== undefined) {
    updateFields.tagline = data.tagline
  }

  const settings = await SystemConfiguration.findOneAndUpdate(
    { key: 'main' },
    { $set: updateFields },
    { new: true, upsert: true }
  )

  return settings!
}

/**
 * Update the logoUrl field and delete the previous logo file from disk if it exists.
 */
export const updateLogoUrl = async (
  logoUrl: string,
  userId: string
): Promise<ISystemConfiguration> => {
  const current = await SystemConfiguration.findOne({ key: 'main' })

  // Delete previous logo file from disk if it exists
  if (current?.logoUrl) {
    const previousPath = path.join(process.cwd(), current.logoUrl.replace(/^\//, ''))
    fs.unlink(previousPath, () => {
      // Silently ignore errors (file may not exist)
    })
  }

  const settings = await SystemConfiguration.findOneAndUpdate(
    { key: 'main' },
    { $set: { logoUrl, updatedBy: userId } },
    { new: true, upsert: true }
  )

  return settings!
}
