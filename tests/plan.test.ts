import { describe, expect, it } from 'vitest';
import type { AmazonCharge, Order } from '@/lib/amazon/parse';
import type { MxCharge } from '@/lib/plan';
import {
  CREDIT,
  DEBIT,
  PAYEE_LIMIT,
  allocate,
  buildPlan,
  isTip,
  matchCharges,
  memoFor,
  payeeFor,
  storePlan,
  toMxCharge,
} from '@/lib/plan';

const mx = (guid: string, cents: number, date: string, type = DEBIT): MxCharge => ({
  guid, cents, date, type, categoryGuid: 'CAT-shopping', memo: null, hasBeenSplit: false, parentGuid: null, pending: false, raw: { guid },
});
const amz = (cents: number, date: string, extra: Partial<AmazonCharge> = {}): AmazonCharge => ({
  date, cents, kind: 'charge', status: 'Approved', descriptor: 'AMZN Mktp US', cardName: 'Prime Visa', last4: '1234',
  orders: [{ id: '112-0000000-0000001', url: '' }], ...extra,
});
const item = (title: string, unitCents: number, quantity = 1) => ({ title, unitCents, quantity, shipment: 0 });

describe('allocate', () => {
  it('adds up exactly', () => {
    expect(allocate(6065, [1440, 999, 1440, 1610])).toEqual([1591, 1104, 1591, 1779]);
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
  });
});

describe('matchCharges', () => {
  it('matches amount and nearby date, closest first', () => {
    const m = matchCharges(
      [mx('a', 1873, '2026-10-23'), mx('b', 1873, '2026-10-30')],
      [amz(1873, '2026-10-22'), amz(1873, '2026-10-29')],
    );
    expect(m.get('a')?.date).toBe('2026-10-22');
    expect(m.get('b')?.date).toBe('2026-10-29');
  });

  it('ignores points payments, wrong direction, and far dates', () => {
    const m = matchCharges(
      [mx('a', 500, '2026-10-23'), mx('b', 700, '2026-10-23', CREDIT), mx('c', 900, '2026-10-23')],
      [amz(500, '2026-10-23', { last4: undefined }), amz(700, '2026-10-23'), amz(900, '2026-10-01')],
    );
    expect(m.size).toBe(0);
  });

  it('matches refunds to credits', () => {
    const m = matchCharges([mx('r', 700, '2026-10-25', CREDIT)], [amz(700, '2026-10-23', { kind: 'refund' })]);
    expect(m.get('r')?.kind).toBe('refund');
  });
});

describe('buildPlan', () => {
  const order: Order = {
    id: '112-0000000-0000001',
    items: [item('Dog food', 4199), item('USB-C cable', 999)],
    summary: [],
    subtotalCents: 5198,
    totalCents: 5415,
  };

  it('makes one part per item and keeps the exact charge', () => {
    const cats = ['CAT-pets', 'CAT-electronics'];
    const plan = buildPlan(5415, [order], (_item, i) => cats[i]!);
    expect(plan.approximate).toBe(false);
    expect(plan.parts.map((p) => [p.categoryGuid, p.cents])).toEqual([['CAT-pets', 4374], ['CAT-electronics', 1041]]);
    expect(plan.parts.reduce((s, p) => s + p.cents, 0)).toBe(5415);
  });

  it('still splits items in the same category, and totals them per category', () => {
    const plan = buildPlan(5415, [order], () => 'CAT-shopping');
    expect(plan.parts.map((p) => p.titles)).toEqual([['Dog food'], ['USB-C cable']]);
    expect(plan.byCategory).toEqual([{ categoryGuid: 'CAT-shopping', cents: 5415, titles: ['Dog food', 'USB-C cable'] }]);
  });

  it('flags a partial charge as approximate and scales it', () => {
    const plan = buildPlan(3000, [order], (_item, i) => `CAT-${i}`);
    expect(plan.approximate).toBe(true);
    expect(plan.parts.reduce((s, p) => s + p.cents, 0)).toBe(3000);
  });

  it('weights by quantity', () => {
    const o: Order = { ...order, items: [item('A', 500, 3), item('B', 500)], totalCents: 2000 };
    expect(buildPlan(2000, [o], (_x, i) => `C${i}`).items.map((p) => p.cents)).toEqual([1500, 500]);
  });
});

describe('grocery orders', () => {
  // Amazon charges the tip on its own; the order page's total includes it.
  const order: Order & { store: string } = {
    id: '112-0000000-0000002',
    items: [item('Hummus', 500), item('Arugula', 479), item('Body butter', 1449)],
    summary: [],
    subtotalCents: 2428,
    totalCents: 3128,
    tipCents: 500,
    store: 'Whole Foods',
  };

  it('tells the tip charge from the order charge', () => {
    expect(isTip(500, [order])).toBe(true);
    expect(isTip(2628, [order])).toBe(false);
    expect(isTip(500, [{ ...order, tipCents: undefined }])).toBe(false);
  });

  it('gives the whole charge one category under the store name', () => {
    const plan = storePlan(2628, order, 'CAT-groceries');
    expect(plan.parts).toEqual([
      { categoryGuid: 'CAT-groceries', cents: 2628, titles: ['Hummus', 'Arugula', 'Body butter'], payee: 'Whole Foods', memo: undefined },
    ]);
    expect(plan.ruleKey).toBe('store:whole foods');
    expect(storePlan(500, order, 'CAT-tips')).toMatchObject({
      parts: [{ cents: 500, titles: [], payee: 'Whole Foods', memo: 'Tip' }],
      ruleKey: 'tip:whole foods',
    });
  });

  it('itemizes the charge without the tip exactly, named after the store', () => {
    const plan = buildPlan(2628, [order], () => 'CAT-groceries');
    expect(plan.approximate).toBe(false);
    expect(plan.parts.reduce((s, p) => s + p.cents, 0)).toBe(2628);
    expect(plan.parts[0]!.payee).toBe('Whole Foods - Hummus');
  });
});

describe('memoFor', () => {
  it('keeps full titles and caps length', () => {
    expect(memoFor(['a'.repeat(100)])).toHaveLength(100);
    expect(memoFor(Array(20).fill('b'.repeat(40))).length).toBeLessThanOrEqual(250);
  });
});

describe('payeeFor', () => {
  it('names single items only', () => {
    expect(payeeFor(['Dog food'])).toBe('Amazon - Dog food');
    expect(payeeFor(['A', 'B'])).toBeUndefined();
  });

  it('keeps the part before the first separator and fits the limit', () => {
    expect(payeeFor(['Acme 26" Bicycle Tire Tubes 26 x 1.95, 2.10, 2.125 Schrader Valve, 2 Pack'])).toBe(
      'Amazon - Acme 26" Bicycle Tire Tubes 26 x 1.95',
    );
    const long = payeeFor(['Extremely Long Product Name With Many Many Descriptive Words In It'])!;
    expect(long.length).toBeLessThanOrEqual(PAYEE_LIMIT);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('toMxCharge', () => {
  const base = { guid: 'TRN-1', amount: 54.15, date: 1792775092, transaction_type: 2 };
  it('treats a feed transaction without posted_date as pending', () => {
    expect(toMxCharge({ ...base, posted_date: null, is_cleared: true })!.pending).toBe(true);
    expect(toMxCharge({ ...base, posted_date: 1792800000 })!.pending).toBe(false);
    expect(toMxCharge({ ...base, posted_date: null, is_manual: true })!.pending).toBe(false);
  });
});
