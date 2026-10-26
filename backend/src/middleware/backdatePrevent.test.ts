import { validateTransactionDate, getBackdateThresholdDays } from './backdatePrevent.js'

describe('Backdate Prevention', () => {
  describe('getBackdateThresholdDays', () => {
    it('should return default threshold of 7 days', () => {
      const original = process.env.BACKDATE_THRESHOLD_DAYS
      delete process.env.BACKDATE_THRESHOLD_DAYS
      expect(getBackdateThresholdDays()).toBe(7)
      if (original) process.env.BACKDATE_THRESHOLD_DAYS = original
    })

    it('should return configured threshold from environment', () => {
      const original = process.env.BACKDATE_THRESHOLD_DAYS
      process.env.BACKDATE_THRESHOLD_DAYS = '14'
      expect(getBackdateThresholdDays()).toBe(14)
      if (original) {
        process.env.BACKDATE_THRESHOLD_DAYS = original
      } else {
        delete process.env.BACKDATE_THRESHOLD_DAYS
      }
    })
  })

  describe('validateTransactionDate', () => {
    it('should accept today\'s date', () => {
      const today = new Date()
      const result = validateTransactionDate(today)
      expect(result).toBeNull()
    })

    it('should accept a date within the threshold', () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const result = validateTransactionDate(threeDaysAgo, 7)
      expect(result).toBeNull()
    })

    it('should reject a date beyond the threshold', () => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const result = validateTransactionDate(thirtyDaysAgo, 7)
      expect(result).not.toBeNull()
      expect(result).toContain('cannot be more than 7 days')
    })

    it('should accept a date exactly at the threshold boundary', () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      // Set to noon to be safely within the day
      sevenDaysAgo.setHours(12, 0, 0, 0)
      const result = validateTransactionDate(sevenDaysAgo, 7)
      expect(result).toBeNull()
    })

    it('should reject invalid date format', () => {
      const result = validateTransactionDate('not-a-date')
      expect(result).toBe('Invalid date format')
    })

    it('should accept date string in ISO format', () => {
      const today = new Date().toISOString()
      const result = validateTransactionDate(today)
      expect(result).toBeNull()
    })

    it('should accept future dates', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const result = validateTransactionDate(tomorrow)
      expect(result).toBeNull()
    })

    it('should use custom threshold', () => {
      const fiveDaysAgo = new Date()
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
      
      // Should pass with 7-day threshold
      expect(validateTransactionDate(fiveDaysAgo, 7)).toBeNull()
      
      // Should fail with 3-day threshold
      expect(validateTransactionDate(fiveDaysAgo, 3)).not.toBeNull()
    })
  })
})
