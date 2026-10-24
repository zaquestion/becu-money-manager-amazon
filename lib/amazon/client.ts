// Runs in the amazon.com content script, so these are same-origin requests
// made with the user's own Amazon session.
import type { AmazonCharge, Order } from './parse';
import { parseOrderPage, parsePaymentsPage, parseTransactionsResponse } from './parse';

const PAYMENTS_URL = '/cpe/yourpayments/transactions';
const TRANSACTIONS_API = '/payments-portal/data/iris/live/v1/data/manage/get-transactions';
const REQUEST_DELAY_MS = 400;
const MAX_PAGES = 40; // 20 charges each

export class SignedOutError extends Error {
  constructor() {
    super('Not signed in to Amazon');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const traceId = (len: number, chars: string) =>
  Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join('');

async function getDocument(path: string): Promise<Document> {
  const response = await fetch(path, { credentials: 'include' });
  if (/\/ap\/(signin|challenge)/.test(response.url)) throw new SignedOutError();
  if (!response.ok) throw new Error(`Amazon returned HTTP ${response.status} for ${path}`);
  return new DOMParser().parseFromString(await response.text(), 'text/html');
}

// Every charge and refund from today back to `since` (YYYY-MM-DD). The page
// gives the first batch; the rest come from the API its infinite scroll uses.
export async function fetchCharges(since: string): Promise<AmazonCharge[]> {
  const page = parsePaymentsPage(await getDocument(PAYMENTS_URL));
  const charges = [...page.charges];
  let key = page.nextKey;
  const reachedSince = () => charges.length > 0 && charges.at(-1)!.date < since;

  for (let n = 0; key && !reachedSince() && n < MAX_PAGES; n++) {
    await sleep(REQUEST_DELAY_MS);
    const response = await fetch(TRANSACTIONS_API, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-amzn-upx-token': page.token,
      },
      body: JSON.stringify({
        type: 'GetTransactions',
        locale: 'en_US',
        surfaceInfo: {
          surfaceType: 'desktop',
          clientApplicationType: 'browser',
          surfaceFeatures: [],
          userAgent: navigator.userAgent,
        },
        requestTraceId: traceId(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
        applicationInstanceTraceId: `A${traceId(32, '0123456789abcdef')}`,
        transactionsViewRequest: { filtersControls: { includeFilters: true } },
        exclusiveStartKey: key,
        widgetName: 'ViewTransactions',
      }),
    });
    if (response.status === 401 || response.status === 403) throw new SignedOutError();
    if (!response.ok) throw new Error(`Amazon returned HTTP ${response.status} loading older transactions`);
    const batch = parseTransactionsResponse(await response.json());
    charges.push(...batch.charges);
    key = batch.nextKey;
  }
  return charges.filter((c) => c.date >= since);
}

export async function fetchOrder(id: string): Promise<Order> {
  // Amazon Pay purchases at other stores; their details live on payments.amazon.com.
  if (id.startsWith('P01-')) throw new Error('Amazon Pay orders from other stores are not supported');
  const order = parseOrderPage(await getDocument(`/gp/css/summary/edit.html?orderID=${encodeURIComponent(id)}`));
  if (order.id !== id) throw new Error(`Asked for order ${id} but got ${order.id}`);
  return order;
}
