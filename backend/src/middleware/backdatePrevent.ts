import { Request, Response, NextFunction } from 'express'

/**
 * Default backdate threshold in days.
 * Transactions with dates older than this many days from now will be rejected.
 */
const DEFAULT_BACKDATE_THRESHOLD_DAYS = 7

/**
 * Get the configured backdate threshold in days from environment or use default.
 */
export const getBackdateThresholdDays = (): number => {
  const envValue = process.env.BACKDATE_THRESHOLD_DAYS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_BACKDATE_THRESHOLD_DAYS
}

/**
 * Validates that a transaction date is not backdated beyond the configured threshold.
 * Returns an error message if the date is too old, or null if valid.
 */
export const validateTransactionDate = (
  transactionDate: Date | string,
  thresholdDays?: number
): string | null => {
  const threshold = thresholdDays ?? getBackdateThresholdDays()
  const date = transactionDate instanceof Date ? transactionDate : new Date(transactionDate)

  if (isNaN(date.getTime())) {
    return 'Invalid date format'
  }

  const now = new Date()
  const cutoffDate = new Date(now)
  cutoffDate.setDate(cutoffDate.getDate() - threshold)
  // Set to start of day for the cutoff
  cutoffDate.setHours(0, 0, 0, 0)

  if (date < cutoffDate) {
    return `Transaction date cannot be more than ${threshold} days in the past. Earliest allowed date: ${cutoffDate.toISOString().split('T')[0]}`
  }

  return null
}

/**
 * Express middleware factory that validates transaction dates in request body.
 * @param dateField - The field name in req.body containing the transaction date
 */
export const preventBackdate = (dateField: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dateValue = req.body[dateField]

    if (!dateValue) {
      // If no date provided, let other validation handle it
      next()
      return
    }

    const error = validateTransactionDate(dateValue)
    if (error) {
      res.status(400).json({
        error: 'Backdate validation failed',
        details: { [dateField]: error },
      })
      return
    }

    next()
  }
}
