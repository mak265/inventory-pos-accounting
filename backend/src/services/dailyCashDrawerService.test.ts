import {
  calculateEffectiveOpeningBalance,
  getPreviousDayBounds,
  resolvePreviousDayCarryOver
} from './dailyCashDrawerService.js';

describe('calculateEffectiveOpeningBalance', () => {
  it('adds opening adjustments to the carry-over balance', () => {
    const carryOver = 1200;
    const adjustments = [
      { date: new Date('2026-08-12T09:00:00Z'), remittedAmount: 150 },
      { date: new Date('2026-08-12T11:00:00Z'), remittedAmount: 50 }
    ];

    expect(calculateEffectiveOpeningBalance(carryOver, adjustments)).toBe(1400);
  });

  it('ignores zero or negative adjustments', () => {
    const carryOver = 500;
    const adjustments = [
      { date: new Date('2026-08-13T08:00:00Z'), remittedAmount: 0 },
      { date: new Date('2026-08-13T09:00:00Z'), remittedAmount: -100 }
    ];

    expect(calculateEffectiveOpeningBalance(carryOver, adjustments)).toBe(500);
  });
});

describe('resolvePreviousDayCarryOver', () => {
  it('uses the latest carry-over from the previous day records', () => {
    const carryOver = resolvePreviousDayCarryOver([
      { date: new Date('2026-08-30T09:00:00Z'), carryOver: 500 },
      { date: new Date('2026-08-30T18:00:00Z'), carryOver: 1250 }
    ]);

    expect(carryOver).toBe(1250);
  });

  it('returns zero when there is no previous-day carry-over record', () => {
    expect(resolvePreviousDayCarryOver([])).toBe(0);
  });
});

describe('getPreviousDayBounds', () => {
  it('returns the calendar day immediately before the selected date', () => {
    const bounds = getPreviousDayBounds('2026-08-31');

    expect(bounds.start.toISOString()).toContain('2026-08-30');
    expect(bounds.end.toISOString()).toContain('2026-08-30');
  });
});
