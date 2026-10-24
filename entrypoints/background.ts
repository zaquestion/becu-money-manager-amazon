import { browser, defineBackground } from '#imports';
import type { AmazonCharge, Order } from '@/lib/amazon/parse';
import type { AmazonRequest, AmazonResult } from '@/lib/messages';
import { AMAZON_READY } from '@/lib/messages';

// Routes Money Manager's requests for Amazon data to an amazon.com tab (an
// open one, or a background tab we open and close again), and caches the
// results so each order is only fetched once.

const HELPER_URL = 'https://www.amazon.com/cpe/yourpayments/transactions';
const READY_TIMEOUT_MS = 45_000;
const HELPER_IDLE_MS = 90_000;
const CHARGES_TTL_MS = 10 * 60_000;
// Long enough to cover a couple of weekly categorizing sessions; older
// orders are deleted, not just refetched.
const ORDER_TTL_MS = 14 * 24 * 60 * 60_000;

let helperTab: number | undefined; // a tab we opened ourselves
let helperTimer: ReturnType<typeof setTimeout> | undefined;
const readyWaiters = new Map<number, () => void>();
let queue: Promise<unknown> = Promise.resolve();

function waitForReady(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      readyWaiters.delete(tabId);
      reject(new Error('Amazon took too long to load'));
    }, READY_TIMEOUT_MS);
    readyWaiters.set(tabId, () => {
      clearTimeout(timer);
      readyWaiters.delete(tabId);
      resolve();
    });
  });
}

function scheduleHelperClose() {
  clearTimeout(helperTimer);
  helperTimer = setTimeout(() => {
    if (helperTab !== undefined) browser.tabs.remove(helperTab).catch(() => {});
    helperTab = undefined;
  }, HELPER_IDLE_MS);
}

async function sendToAmazon<T>(message: AmazonRequest): Promise<AmazonResult<T>> {
  // Firefox lets users turn off site access; without it the content script
  // never loads and we'd only time out.
  if (!(await browser.permissions.contains({ origins: ['https://www.amazon.com/*'] }))) {
    return { ok: false, error: "The extension isn't allowed to access amazon.com. Allow it in the extension's permissions, then click Refresh." };
  }
  const tabs = await browser.tabs.query({ url: 'https://www.amazon.com/*', status: 'complete' });
  // Prefer an Amazon tab the user already has open.
  for (const tab of tabs.sort((a, b) => Number(a.id === helperTab) - Number(b.id === helperTab))) {
    if (tab.id === undefined) continue;
    try {
      const result = await browser.tabs.sendMessage(tab.id, message);
      if (result) {
        if (tab.id === helperTab) scheduleHelperClose();
        return result;
      }
    } catch {
      // no content script in that tab (opened before the extension loaded)
    }
  }
  const tab = await browser.tabs.create({ url: HELPER_URL, active: false });
  if (tab.id === undefined) throw new Error("Couldn't open an Amazon tab");
  const id = (helperTab = tab.id);
  await waitForReady(id);
  scheduleHelperClose();
  return browser.tabs.sendMessage(id, message);
}

// One Amazon request at a time.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

interface CachedCharges {
  since: string;
  at: number;
  charges: AmazonCharge[];
}

async function getCharges(since: string, fresh?: boolean): Promise<AmazonResult<AmazonCharge[]>> {
  const { charges: cached } = (await browser.storage.session.get('charges')) as { charges?: CachedCharges };
  if (!fresh && cached && cached.since <= since && Date.now() - cached.at < CHARGES_TTL_MS) {
    return { ok: true, value: cached.charges.filter((c) => c.date >= since) };
  }
  const result = await enqueue(() => sendToAmazon<AmazonCharge[]>({ type: 'amazon:charges', since }));
  if (result.ok) {
    await browser.storage.session.set({ charges: { since, at: Date.now(), charges: result.value } satisfies CachedCharges });
  }
  return result;
}

async function getOrder(id: string, fresh?: boolean): Promise<AmazonResult<Order>> {
  const key = `order:${id}`;
  const cached = (await browser.storage.local.get(key))[key] as { at: number; order: Order } | undefined;
  if (!fresh && cached && Date.now() - cached.at < ORDER_TTL_MS) return { ok: true, value: cached.order };
  const result = await enqueue(() => sendToAmazon<Order>({ type: 'amazon:order', id }));
  if (result.ok) await browser.storage.local.set({ [key]: { at: Date.now(), order: result.value } });
  return result;
}

async function purgeOrders() {
  const all = await browser.storage.local.get(null);
  const fresh = (value: unknown) => Date.now() - ((value as { at?: number })?.at ?? 0) < ORDER_TTL_MS;
  const expired = Object.keys(all).filter((key) => key.startsWith('order:') && !fresh(all[key]));
  if (expired.length) await browser.storage.local.remove(expired);
}

export default defineBackground(() => {
  // Runs each time the worker starts, which it does whenever it's needed.
  purgeOrders().catch(() => {});

  browser.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type === AMAZON_READY) {
      if (sender.tab?.id !== undefined) readyWaiters.get(sender.tab.id)?.();
      return false;
    }
    // Only Money Manager's content script may ask for Amazon data.
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith('https://widgets.moneydesktop.com/')) return false;
    const request = message as AmazonRequest;
    const work =
      request.type === 'amazon:charges'
        ? getCharges(request.since, request.fresh)
        : request.type === 'amazon:order'
          ? getOrder(request.id, request.fresh)
          : undefined;
    if (!work) return false;
    work.then(reply, (err: Error) => reply({ ok: false, error: err.message }));
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabId === helperTab) helperTab = undefined;
  });
});
