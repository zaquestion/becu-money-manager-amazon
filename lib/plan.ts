// Pure logic: which Amazon charge each Money Manager transaction is, and how
// to divide it between categories.
import type { AmazonCharge, Order, OrderItem } from './amazon/parse';
import type { RawTransaction } from './mx/session';

export const CREDIT = 1;
export const DEBIT = 2;

export interface MxCharge {
  guid: string;
  cents: number;
  type: number; // CREDIT or DEBIT
  date: string; // YYYY-MM-DD (UTC)
  categoryGuid: string | null;
  memo: string | null;
  hasBeenSplit: boolean;
  parentGuid: string | null;
  // Still pending at the bank: a feed transaction with no posted_date
  // (is_cleared is true even while pending). Manual ones never have one.
  pending: boolean;
  raw: RawTransaction;
}

export function toMxCharge(raw: RawTransaction): MxCharge | undefined {
  const amount = Number(raw.amount);
  const secs = typeof raw.date === 'number' ? raw.date : Date.parse(String(raw.date)) / 1000;
  if (!Number.isFinite(amount) || !Number.isFinite(secs)) return undefined;
  return {
    guid: raw.guid,
    cents: Math.round(Math.abs(amount) * 100),
    type: raw.transaction_type === CREDIT ? CREDIT : DEBIT,
    date: new Date(secs * 1000).toISOString().slice(0, 10),
    categoryGuid: typeof raw.category_guid === 'string' ? raw.category_guid : null,
    memo: typeof raw.memo === 'string' ? raw.memo : null,
    hasBeenSplit: raw.has_been_split === true,
    parentGuid: typeof raw.parent_guid === 'string' ? raw.parent_guid : null,
    pending: raw.is_manual !== true && raw.posted_date == null,
    raw,
  };
}

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);

// How far after Amazon's date the card transaction may be dated (it can also
// post a little earlier, e.g. time zones).
export const MATCH_WINDOW = { before: 2, after: 5 };

// Same amount, close date, same direction. Each side is used at most once,
// closest dates first. Charges paid with reward points or gift cards have no
// card number and never reach the card, so they are left out.
export function matchCharges(mx: MxCharge[], amazon: AmazonCharge[]): Map<string, AmazonCharge> {
  const pairs: { m: MxCharge; a: AmazonCharge; distance: number }[] = [];
  for (const m of mx) {
    if (m.parentGuid) continue;
    for (const a of amazon) {
      if (!a.last4 || a.cents !== m.cents) continue;
      if ((a.kind === 'refund') !== (m.type === CREDIT)) continue;
      const d = dayDiff(m.date, a.date);
      if (d < -MATCH_WINDOW.before || d > MATCH_WINDOW.after) continue;
      pairs.push({ m, a, distance: Math.abs(d) });
    }
  }
  pairs.sort((x, y) => x.distance - y.distance);
  const result = new Map<string, AmazonCharge>();
  const used = new Set<AmazonCharge>();
  for (const { m, a } of pairs) {
    if (result.has(m.guid) || used.has(a)) continue;
    result.set(m.guid, a);
    used.add(a);
  }
  return result;
}

// Divide `total` cents in proportion to `weights`, so the parts add up to
// exactly `total` (largest remainder gets the leftover cents).
export function allocate(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + Math.max(w, 0), 0);
  const shares = weights.map((w) => (sum > 0 ? (total * Math.max(w, 0)) / sum : total / weights.length));
  const parts = shares.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = shares.map((s, i) => [s - Math.floor(s), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    parts[i]!++;
    left--;
  }
  return parts;
}

export interface PlannedItem {
  item: OrderItem;
  orderId: string;
  cents: number; // this item's share of the card charge (incl. tax, shipping, discounts)
  categoryGuid: string;
}

export interface Part {
  categoryGuid: string;
  cents: number;
  titles: string[];
  // Instead of the ones made from `titles`.
  payee?: string;
  memo?: string;
}

export interface Plan {
  items: PlannedItem[];
  // What the transaction becomes: one part per item, so each item's name
  // shows in Money Manager even when they share a category. A single part
  // means recategorize rather than split. Parts add up to the charge.
  parts: Part[];
  // Totals per category, in first-seen order, for display.
  byCategory: Part[];
  // The orders' total differs from this charge (several charges for one
  // order, or part paid with points/gift card), so shares are proportional.
  approximate: boolean;
  // Remember the category under this key rather than per item.
  ruleKey?: string;
}

// Shares the whole charge across items by price, which spreads tax,
// shipping and discounts the same way.
export function buildPlan(
  chargeCents: number,
  orders: Order[],
  categoryFor: (item: OrderItem, index: number) => string,
): Plan {
  const lines = orders.flatMap((o) => o.items.map((item) => ({ item, orderId: o.id })));
  const shares = allocate(
    chargeCents,
    lines.map(({ item }) => item.unitCents * item.quantity),
  );
  const items = lines.map(({ item, orderId }, i) => ({
    item,
    orderId,
    cents: shares[i]!,
    categoryGuid: categoryFor(item, i),
  }));
  const store = orders.every((o) => o.store === orders[0]?.store) ? orders[0]?.store : undefined;
  const parts = items.map((p) => ({
    categoryGuid: p.categoryGuid,
    cents: p.cents,
    titles: [p.item.title],
    payee: store && payeeFor([p.item.title], `${store} - `),
  }));
  const byCategory: Part[] = [];
  for (const p of items) {
    let total = byCategory.find((x) => x.categoryGuid === p.categoryGuid);
    if (!total) byCategory.push((total = { categoryGuid: p.categoryGuid, cents: 0, titles: [] }));
    total.cents += p.cents;
    total.titles.push(p.item.title);
  }
  const orderTotal = orders.reduce((s, o) => s + (o.totalCents ?? NaN), 0);
  // Grocery orders charge the tip separately.
  const tips = orders.reduce((s, o) => s + (o.tipCents ?? 0), 0);
  return { items, parts, byCategory, approximate: !(orderTotal === chargeCents || orderTotal - tips === chargeCents) };
}

// The separate charge for a grocery order's tip.
export function isTip(chargeCents: number, orders: Order[]): boolean {
  const order = orders.length === 1 ? orders[0]! : undefined;
  return !!order?.tipCents && order.tipCents === chargeCents && order.totalCents !== chargeCents;
}

export const storeRuleKey = (store: string, tip: boolean) => `${tip ? 'tip' : 'store'}:${store.toLowerCase()}`;

// A store's grocery charge (or its tip) as one part under the store's name,
// for when the items aren't wanted one by one.
export function storePlan(chargeCents: number, order: Order & { store: string }, categoryGuid: string): Plan {
  const tip = isTip(chargeCents, [order]);
  const part: Part = {
    categoryGuid,
    cents: chargeCents,
    titles: tip ? [] : order.items.map((i) => i.title),
    payee: order.store,
    memo: tip ? 'Tip' : undefined,
  };
  return { items: [], parts: [part], byCategory: [part], approximate: false, ruleKey: storeRuleKey(order.store, tip) };
}

const MEMO_LIMIT = 250;

// Full item titles; only cut when several don't fit.
export function memoFor(titles: string[]): string {
  const memo = titles.join('; ');
  return memo.length > MEMO_LIMIT ? `${memo.slice(0, MEMO_LIMIT - 1).trimEnd()}…` : memo;
}

// MX's payee limit isn't known; the widget's input has no maxlength. Kept
// short so it reads well in the transaction list either way.
export const PAYEE_LIMIT = 50;
export const PAYEE_PREFIX = 'Amazon - ';

// "Amazon - <item>" when a transaction (or split part) is a single item;
// with several items the payee is left alone. Amazon titles are long and
// keyword-stuffed, so keep the part before the first separator when it
// still says something.
export function payeeFor(titles: string[], prefix = PAYEE_PREFIX): string | undefined {
  if (titles.length !== 1) return undefined;
  let name = titles[0]!.replace(/\s+/g, ' ').trim();
  const cut = /,| \| | - | – | — /.exec(name);
  if (cut && cut.index >= 15) name = name.slice(0, cut.index);
  const room = PAYEE_LIMIT - prefix.length;
  if (name.length > room) {
    const words = name.slice(0, room - 1);
    const space = words.lastIndexOf(' ');
    name = `${(space > room / 2 ? words.slice(0, space) : words).trimEnd()}…`;
  }
  return prefix + name;
}
