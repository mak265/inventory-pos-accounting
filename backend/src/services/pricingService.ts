/**
 * Pricing Service
 *
 * Handles dynamic pricing calculations with percentage or fixed markup.
 *
 * Requirements:
 * - 6.2: Calculate selling price with percentage markup
 * - 6.3: Calculate selling price with fixed markup
 * - 6.6: Default selling price equals average cost when no markup configured
 */

/**
 * Calculate selling price with markup percentage
 *
 * Formula: selling_price = cost × (1 + markup_percentage / 100)
 *
 * @param cost - Base cost of the product
 * @param markupPercentage - Markup percentage to apply (e.g., 20 for 20%)
 * @returns Calculated selling price
 *
 * Validates: Requirements 6.2
 */
export function calculateSellingPriceWithMarkup(
  cost: number,
  markupPercentage: number
): number {
  if (cost < 0) {
    throw new Error('Cost cannot be negative');
  }
  if (markupPercentage < 0) {
    throw new Error('Markup percentage cannot be negative');
  }

  return cost * (1 + markupPercentage / 100);
}

/**
 * Calculate selling price with fixed markup amount
 *
 * Formula: selling_price = cost + fixedAmount
 *
 * @param cost - Base cost of the product
 * @param fixedAmount - Fixed amount to add to cost
 * @returns Calculated selling price
 *
 * Validates: Requirements 6.3
 */
export function calculateFixedMarkupPrice(
  cost: number,
  fixedAmount: number
): number {
  if (cost < 0) {
    throw new Error('Cost cannot be negative');
  }
  if (fixedAmount < 0) {
    throw new Error('Fixed markup amount cannot be negative');
  }

  return cost + fixedAmount;
}

/**
 * Round price to nearest currency unit
 *
 * Rounds to the nearest whole number (peso)
 *
 * @param price - Price to round
 * @returns Rounded price
 */
export function roundPrice(price: number): number {
  // Round to nearest whole peso (1 peso granularity)
  return Math.round(price);
}

/**
 * Calculate final selling price with markup (percentage or fixed)
 *
 * Dispatches to the appropriate calculation based on markupType,
 * then rounds the result.
 * When no markup is configured, returns cost as-is (averageCost = sellingPrice).
 *
 * @param cost - Base cost (average cost) of the product
 * @param markupType - Type of markup: 'percentage' or 'fixed'
 * @param markupPercentage - Markup percentage (used when markupType is 'percentage')
 * @param fixedMarkupAmount - Fixed markup amount (used when markupType is 'fixed')
 * @returns Final calculated and rounded selling price
 *
 * Validates: Requirements 6.2, 6.3, 6.6
 */
export function calculateFinalSellingPrice(
  cost: number,
  markupType?: 'percentage' | 'fixed',
  markupPercentage?: number,
  fixedMarkupAmount?: number
): number {
  let price = cost;

  if (markupType === 'percentage' && markupPercentage !== undefined && markupPercentage > 0) {
    price = calculateSellingPriceWithMarkup(price, markupPercentage);
  } else if (markupType === 'fixed' && fixedMarkupAmount !== undefined && fixedMarkupAmount > 0) {
    price = calculateFixedMarkupPrice(price, fixedMarkupAmount);
  }

  return roundPrice(price);
}
