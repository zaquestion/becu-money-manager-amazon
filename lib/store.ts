// Extension storage used by the Money Manager UI (ISOLATED world).
import { browser } from 'wxt/browser';
import type { OrderItem } from './amazon/parse';

export interface Applied {
  kind: 'split' | 'recategorize';
  at: number;
  // For undoing a recategorize.
  prevCategoryGuid?: string | null;
  prevMemo?: string | null;
  prevDescription?: string;
}

interface Stored {
  rules: Record<string, string>; // item key -> MX category guid
  applied: Record<string, Applied>; // MX transaction guid -> what we did
  writeMemos: boolean;
  writePayees: boolean;
  itemizeGroceries: boolean; // otherwise a grocery charge gets one category
}

const DEFAULTS: Stored = { rules: {}, applied: {}, writeMemos: true, writePayees: true, itemizeGroceries: false };

export const store: Stored = structuredClone(DEFAULTS);

export async function loadStore() {
  Object.assign(store, await browser.storage.local.get({ ...DEFAULTS } as Record<string, unknown>));
}

export async function saveStore(...keys: (keyof Stored)[]) {
  await browser.storage.local.set(Object.fromEntries(keys.map((k) => [k, store[k]])));
}

// Remembered per product, falling back to the exact title for items with no ASIN.
export const itemKey = (item: OrderItem) => (item.asin ? `asin:${item.asin}` : `title:${item.title.toLowerCase()}`);
