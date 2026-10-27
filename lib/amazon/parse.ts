// Parsers for the Amazon pages and API responses the extension reads. All of
// these take already-fetched text/documents so they can be tested against
// saved pages.

export interface AmazonCharge {
  date: string; // YYYY-MM-DD, as Amazon shows it
  cents: number; // always positive
  kind: 'charge' | 'refund';
  status: string; // Amazon's own status: Pending, Approved, Declined, ...
  descriptor: string; // statement text: "Amazon.com", "AMZN Mktp US", ...
  cardName: string;
  last4?: string; // missing for reward points and gift cards
  orders: { id: string; url: string }[];
}

export interface PaymentsPage {
  token: string;
  charges: AmazonCharge[];
  nextKey?: string;
}

export interface TransactionsBatch {
  charges: AmazonCharge[];
  nextKey?: string;
}

export interface OrderItem {
  title: string;
  asin?: string;
  unitCents: number;
  quantity: number;
  shipment: number; // index of the shipment box on the page
}

export interface Order {
  id: string;
  date?: string;
  items: OrderItem[];
  summary: { label: string; cents: number }[];
  subtotalCents?: number;
  totalCents?: number; // includes the tip, which Amazon charges separately
  tipCents?: number;
  store?: string; // grocery orders: "Whole Foods" or "Amazon Fresh"
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Oct 23, 2026" or "October 11, 2026" -> "2026-10-23"
export function parseDate(text: string): string | undefined {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

// "-$1,234.56" -> -123456
export function parseCents(text: string): number | undefined {
  const m = /(-|−)?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/.exec(text);
  if (!m) return undefined;
  const cents = Math.round(Number(m[2]!.replace(/,/g, '')) * 100);
  return m[1] ? -cents : cents;
}

interface RawTransaction {
  formattedAmount?: string;
  formattedDate?: string;
  orderData?: { orderDisplayString?: string; orderDetailsUrl?: string }[];
  statementDescriptor?: string;
  statusInfo?: { status?: string; label?: string; amountDetailsStatusType?: string };
  paymentMethodDisplayStringData?: {
    paymentMethodName?: string;
    paymentMethodNumber?: { lastDigits?: string };
  };
}

export function parseTransaction(raw: RawTransaction): AmazonCharge | undefined {
  const signed = parseCents(raw.formattedAmount ?? '');
  const date = parseDate(raw.formattedDate ?? '');
  if (signed === undefined || !date) return undefined;
  const type = raw.statusInfo?.amountDetailsStatusType?.toLowerCase() ?? '';
  const orders = (raw.orderData ?? []).flatMap((o) => {
    const id = /[A-Z0-9]{3}-\d{7}-\d{7}/.exec(o.orderDisplayString ?? o.orderDetailsUrl ?? '')?.[0];
    return id ? [{ id, url: o.orderDetailsUrl ?? '' }] : [];
  });
  const payment = raw.paymentMethodDisplayStringData;
  return {
    date,
    cents: Math.abs(signed),
    kind: type.includes('refund') || signed > 0 ? 'refund' : 'charge',
    status: raw.statusInfo?.status ?? '',
    descriptor: raw.statementDescriptor ?? '',
    cardName: payment?.paymentMethodName ?? '',
    last4: payment?.paymentMethodNumber?.lastDigits || undefined,
    orders,
  };
}

const parseAll = (list: unknown) =>
  (Array.isArray(list) ? list : []).flatMap((raw) => parseTransaction(raw as RawTransaction) ?? []);

// The Your Payments > Transactions page (/cpe/yourpayments/transactions)
// embeds its first batch of transactions and an API token in __NEXT_DATA__.
export function parsePaymentsPage(doc: Document): PaymentsPage {
  const json = doc.querySelector('script#__NEXT_DATA__')?.textContent;
  if (!json) throw new Error('Payments page has no __NEXT_DATA__ (signed out, or the page changed)');
  const props = JSON.parse(json)?.props?.pageProps;
  const state = props?.state?.transactionResponseState;
  if (typeof props?.token !== 'string' || !state) throw new Error('Payments page data is missing the token or transactions');
  return {
    token: props.token,
    charges: parseAll(state.visibleTransactionResponse?.transactionList),
    nextKey: state.hasMore !== false ? state.lastEvaluatedPageKey || undefined : undefined,
  };
}

// Response of POST /payments-portal/data/iris/live/v1/data/manage/get-transactions
export function parseTransactionsResponse(json: unknown): TransactionsBatch {
  const response = (json as { displayResponse?: { transactionsList?: unknown; lastEvaluatedKey?: string } })
    ?.displayResponse;
  if (!response) throw new Error('Unexpected get-transactions response');
  return { charges: parseAll(response.transactionsList), nextKey: response.lastEvaluatedKey || undefined };
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const component = (root: ParentNode, name: string) => root.querySelector(`[data-component="${name}"]`);

// The order details page (/gp/css/summary/edit.html?orderID=...). Sections
// are marked with data-component attributes.
export function parseOrderPage(doc: Document): Order {
  const id = /[A-Z0-9]{3}-\d{7}-\d{7}/.exec(text(component(doc, 'orderId')))?.[0];
  if (!id) throw new Error('Not an order details page (signed out, or the page changed)');

  const summary: Order['summary'] = [];
  for (const row of doc.querySelectorAll('[data-component="chargeSummary"] .od-line-item-row')) {
    const label = text(row.querySelector('.od-line-item-row-label')).replace(/:$/, '');
    const cents = parseCents(text(row.querySelector('.od-line-item-row-content')));
    if (label && cents !== undefined) summary.push({ label, cents });
  }
  const find = (re: RegExp) => summary.find((s) => re.test(s.label))?.cents;

  const boxes = [...doc.querySelectorAll('[data-component="shipments"] .a-box')];
  const items: OrderItem[] = [];
  for (const title of doc.querySelectorAll('[data-component="itemTitle"]')) {
    // The nearest ancestor that also holds a price is the item's own row.
    let row: Element | null = title.parentElement;
    while (row && !component(row, 'unitPrice')) row = row.parentElement;
    if (!row) continue;
    const price = component(row, 'unitPrice');
    const unitCents = parseCents(text(price?.querySelector('.a-offscreen') ?? price));
    if (unitCents === undefined) continue;
    const href = title.querySelector('a')?.getAttribute('href') ?? '';
    const qty = Number(/\d+/.exec(text(component(row, 'quantity')))?.[0] ?? 1);
    const box = title.closest('.a-box');
    items.push({
      title: text(title),
      asin: /\/dp\/([A-Z0-9]{10})/.exec(href)?.[1],
      unitCents,
      quantity: qty > 0 ? qty : 1,
      shipment: box ? Math.max(boxes.indexOf(box), 0) : 0,
    });
  }

  return {
    id,
    date: parseDate(text(component(doc, 'orderDate'))),
    items,
    summary,
    subtotalCents: find(/^item\(s\) subtotal/i),
    totalCents: find(/^grand total/i),
  };
}

// Grocery delivery/pickup orders (/uff/your-account/order-details?orderID=...),
// where Amazon sends them instead of the usual order page.
export const isGroceryOrderPage = (doc: Document) => !!doc.querySelector('#order-summary .ufpo-charge-breakdown');

export function parseGroceryOrderPage(doc: Document): Order {
  const head = doc.querySelector('#order-summary');
  const id = /[A-Z0-9]{3}-\d{7}-\d{7}/.exec(text(head))?.[0];
  if (!id) throw new Error('Not a grocery order page (signed out, or the page changed)');

  const summary: Order['summary'] = [];
  for (const row of doc.querySelectorAll('.ufpo-charge-breakdown .a-row')) {
    const label = text(row.querySelector('dt')).replace(/:$/, '');
    // A waived fee shows the struck-out price first, then what was charged.
    const cents = parseCents(text([...(row.querySelector('dd')?.querySelectorAll('span') ?? [])].at(-1)));
    if (label && cents !== undefined) summary.push({ label, cents });
  }
  const find = (re: RegExp) => summary.find((s) => re.test(s.label))?.cents;

  const items: OrderItem[] = [];
  for (const row of doc.querySelectorAll('[id$="-item-grid-row"]')) {
    const asin = /^([A-Z0-9]{10})-item-grid-row$/.exec(row.id)?.[1];
    const title = text(row.querySelector('a[href*="/product/"], a[href*="/dp/"]')) || row.querySelector('img')?.getAttribute('alt') || '';
    const lineCents = parseCents(text(row.querySelector('[id$="-item-total-price"]')));
    if (!title || lineCents === undefined) continue;
    // The price is for the line; items sold by weight have no whole count.
    const qty = Number(text(row.querySelector('.a-span1.a-text-center')));
    const whole = Number.isInteger(qty) && qty > 0 && lineCents % qty === 0;
    items.push({ title, asin, unitCents: whole ? lineCents / qty : lineCents, quantity: whole ? qty : 1, shipment: 0 });
  }

  return {
    id,
    date: parseDate(text(head)),
    items,
    summary,
    subtotalCents: find(/^item\(s\) subtotal/i),
    totalCents: find(/^grand total/i),
    tipCents: find(/tip$/i),
    store: /Whole Foods/i.test(text(doc.querySelector('#ufpo-order-status-container'))) ? 'Whole Foods' : 'Amazon Fresh',
  };
}
