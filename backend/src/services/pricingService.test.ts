import {
  calculateSellingPriceWithMarkup,
  calculateFixedMarkupPrice,
  roundPrice,
  calculateFinalSellingPrice
} from './pricingService.js';

describe('Pricing Service', () => {
  describe('calculateSellingPriceWithMarkup', () => {
    it('should calculate selling price with markup correctly', () => {
      expect(calculateSellingPriceWithMarkup(100, 20)).toBe(120);
      expect(calculateSellingPriceWithMarkup(50, 50)).toBe(75);
      expect(calculateSellingPriceWithMarkup(200, 10)).toBeCloseTo(220);
    });

    it('should handle zero markup', () => {
      expect(calculateSellingPriceWithMarkup(100, 0)).toBe(100);
    });

    it('should handle decimal markup percentages', () => {
      expect(calculateSellingPriceWithMarkup(100, 12.5)).toBe(112.5);
    });

    it('should throw error for negative cost', () => {
      expect(() => calculateSellingPriceWithMarkup(-100, 20)).toThrow('Cost cannot be negative');
    });

    it('should throw error for negative markup', () => {
      expect(() => calculateSellingPriceWithMarkup(100, -20)).toThrow('Markup percentage cannot be negative');
    });
  });

  describe('calculateFixedMarkupPrice', () => {
    it('should calculate selling price with fixed markup correctly', () => {
      expect(calculateFixedMarkupPrice(100, 25)).toBe(125);
      expect(calculateFixedMarkupPrice(50, 10)).toBe(60);
      expect(calculateFixedMarkupPrice(200, 0)).toBe(200);
    });

    it('should handle zero fixed amount', () => {
      expect(calculateFixedMarkupPrice(100, 0)).toBe(100);
    });

    it('should handle decimal fixed amounts', () => {
      expect(calculateFixedMarkupPrice(100, 7.5)).toBe(107.5);
    });

    it('should throw error for negative cost', () => {
      expect(() => calculateFixedMarkupPrice(-100, 25)).toThrow('Cost cannot be negative');
    });

    it('should throw error for negative fixed amount', () => {
      expect(() => calculateFixedMarkupPrice(100, -25)).toThrow('Fixed markup amount cannot be negative');
    });
  });

  describe('roundPrice', () => {
    it('should round price to nearest whole number', () => {
      expect(roundPrice(100.4)).toBe(100);
      expect(roundPrice(100.5)).toBe(101);
      expect(roundPrice(100.6)).toBe(101);
    });

    it('should handle already rounded prices', () => {
      expect(roundPrice(100)).toBe(100);
    });

    it('should round negative prices correctly', () => {
      expect(roundPrice(-100.4)).toBe(-100);
      expect(roundPrice(-100.5)).toBe(-100);
      expect(roundPrice(-100.6)).toBe(-101);
    });
  });

  describe('calculateFinalSellingPrice', () => {
    it('should calculate price with percentage markup', () => {
      expect(calculateFinalSellingPrice(100, 'percentage', 20)).toBe(120);
    });

    it('should calculate price with fixed markup', () => {
      expect(calculateFinalSellingPrice(100, 'fixed', undefined, 25)).toBe(125);
    });

    it('should round percentage markup result', () => {
      // 100 * 1.125 = 112.5, rounded = 113
      expect(calculateFinalSellingPrice(100, 'percentage', 12.5)).toBe(113);
    });

    it('should round fixed markup result', () => {
      // 85.50 + 10.75 = 96.25, rounded = 96
      expect(calculateFinalSellingPrice(85.50, 'fixed', undefined, 10.75)).toBe(96);
    });

    it('should return rounded cost when no markup type provided', () => {
      expect(calculateFinalSellingPrice(100)).toBe(100);
    });

    it('should return rounded cost when markup percentage is zero', () => {
      expect(calculateFinalSellingPrice(100, 'percentage', 0)).toBe(100);
    });

    it('should return rounded cost when fixed amount is zero', () => {
      expect(calculateFinalSellingPrice(100, 'fixed', undefined, 0)).toBe(100);
    });

    it('should return rounded cost when markup type is percentage but no percentage given', () => {
      expect(calculateFinalSellingPrice(100, 'percentage')).toBe(100);
    });

    it('should return rounded cost when markup type is fixed but no amount given', () => {
      expect(calculateFinalSellingPrice(100, 'fixed')).toBe(100);
    });

    it('should handle complex percentage markup with rounding', () => {
      // 85.50 * 1.30 = 111.15, rounded = 111
      expect(calculateFinalSellingPrice(85.50, 'percentage', 30)).toBe(111);
    });

    it('should handle complex fixed markup with rounding', () => {
      // 85.50 + 30 = 115.50, rounded = 116
      expect(calculateFinalSellingPrice(85.50, 'fixed', undefined, 30)).toBe(116);
    });
  });
});
