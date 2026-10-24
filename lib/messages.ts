// Messages between the Money Manager content script, the background worker
// and the amazon.com content script.
import type { AmazonCharge, Order } from './amazon/parse';

export type AmazonRequest =
  | { type: 'amazon:charges'; since: string; fresh?: boolean }
  | { type: 'amazon:order'; id: string; fresh?: boolean };

export type AmazonResult<T> = { ok: true; value: T } | { ok: false; error: string; signedOut?: boolean };

export type ChargesResult = AmazonResult<AmazonCharge[]>;
export type OrderResult = AmazonResult<Order>;

// Sent by the amazon.com content script once it can take requests.
export const AMAZON_READY = 'amazon:ready';
