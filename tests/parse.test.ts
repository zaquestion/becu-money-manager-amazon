// Checks the parsers against pages saved from a real Amazon account. Those
// stay out of git (samples/ is ignored), so these tests skip without them,
// and they only assert on numbers, never on item names.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCents, parseDate, parseOrderPage, parsePaymentsPage, parseTransactionsResponse } from '@/lib/amazon/parse';

// (happy-dom replaces URL, so build paths with node:path.)
const local = (path: string) => join(import.meta.dirname, '..', path);
const sample = (name: string) => local(`samples/${name}`);
const doc = (name: string) => new DOMParser().parseFromString(readFileSync(sample(name), 'utf8'), 'text/html');
const has = (name: string) => existsSync(sample(name));

describe('helpers', () => {
  it('parses dates and amounts', () => {
    expect(parseDate('Oct 23, 2026')).toBe('2026-10-23');
    expect(parseDate('September 3, 2026')).toBe('2026-09-03');
    expect(parseCents('-$1,234.56')).toBe(-123456);
    expect(parseCents(' $0.11 ')).toBe(11);
  });
});

describe.skipIf(!has('Your Payments.html'))('payments page', () => {
  it('reads the embedded transactions, token and next key', () => {
    const page = parsePaymentsPage(doc('Your Payments.html'));
    expect(page.token.length).toBeGreaterThan(100);
    expect(page.nextKey).toBeTruthy();
    expect(page.charges.length).toBe(20);
    for (const c of page.charges) {
      expect(c.date).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(c.cents).toBeGreaterThan(0);
    }
    expect(page.charges.every((c) => c.orders.length > 0)).toBe(true);
  });
});

describe.skipIf(!existsSync(local('amz_transactions')))('get-transactions response', () => {
  it('reads the next batch', () => {
    const text = readFileSync(local('amz_transactions'), 'utf8');
    const json = JSON.parse(text.slice(text.indexOf('{', text.indexOf('Response')), text.lastIndexOf('}') + 1));
    const batch = parseTransactionsResponse(json);
    expect(batch.charges.length).toBe(20);
    expect(batch.nextKey).toBeTruthy();
    expect(batch.charges.some((c) => !c.last4)).toBe(true); // reward points payments
  });
});

describe.each(['Order Details (1 item).html', 'Order Details (multi item).html'].filter(has))('%s', (name) => {
  it('items add up to the subtotal and the summary to the total', () => {
    const order = parseOrderPage(doc(name));
    expect(order.id).toMatch(/^\d{3}-\d{7}-\d{7}$/);
    expect(order.items.length).toBeGreaterThan(0);
    for (const item of order.items) expect(item.title.length).toBeGreaterThan(3);
    const items = order.items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
    expect(items).toBe(order.subtotalCents);
    expect(order.totalCents).toBeGreaterThan(0);
  });
});
