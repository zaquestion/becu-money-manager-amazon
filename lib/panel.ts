// The "Amazon items" panel. Runs in Money Manager's ISOLATED world: it gets
// MX data from the MAIN world over the bridge, and Amazon data from the
// background worker.
import { browser } from 'wxt/browser';
import type { AmazonCharge, Order } from './amazon/parse';
import type { Snapshot } from './bridge';
import { callMain, connectBridge } from './bridge';
import type { AmazonRequest, ChargesResult, OrderResult } from './messages';
import type { Category } from './mx/session';
import type { ComboOption } from './combobox';
import { combobox } from './combobox';
import type { Inline } from './drawer';
import { watchDrawer } from './drawer';
import { INLINE_STYLE, STYLE } from './panel-style';
import type { MxCharge, Part, Plan } from './plan';
import { CREDIT, MATCH_WINDOW, buildPlan, matchCharges, memoFor, payeeFor, toMxCharge } from './plan';
import { itemKey, loadStore, saveStore, store } from './store';
import { toolbarButton, watchToolbar } from './toolbar';

const AMAZON_ORDER_URL = 'https://www.amazon.com/gp/css/summary/edit.html?orderID=';
const AMAZON_PAYMENTS_URL = 'https://www.amazon.com/cpe/yourpayments/transactions';

type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; error: string; signedOut?: boolean };

interface Note {
  tone: 'ok' | 'error';
  text: string;
}

const state = {
  open: false,
  snapshot: { hasSession: false, categories: [], transactions: [] } as Snapshot,
  amazon: undefined as (Load<AmazonCharge[]> & { since?: string }) | undefined,
  orders: new Map<string, Load<Order>>(),
  choices: new Map<string, string>(), // `${mx guid}|${item index}` -> category guid
  expanded: new Set<string>(),
  inline: undefined as Inline | undefined, // section in the details drawer
  busy: new Set<string>(),
  confirming: undefined as string | undefined,
  notes: new Map<string, Note>(),
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('data-') || k.startsWith('aria-')) el.setAttribute(k, String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

async function ask<T>(request: AmazonRequest): Promise<{ ok: true; value: T } | { ok: false; error: string; signedOut?: boolean }> {
  try {
    return await browser.runtime.sendMessage(request);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Derived data

function mxCharges(): { parents: MxCharge[]; parts: Map<string, number> } {
  const all = state.snapshot.transactions.flatMap((raw) => toMxCharge(raw) ?? []);
  const parts = new Map<string, number>();
  for (const m of all) if (m.parentGuid) parts.set(m.parentGuid, (parts.get(m.parentGuid) ?? 0) + 1);
  const parents = all.filter((m) => !m.parentGuid).sort((a, b) => b.date.localeCompare(a.date));
  return { parents, parts };
}

// Amazon data is needed back to a little before the oldest charge in view.
function neededSince(parents: MxCharge[]): string | undefined {
  const oldest = parents.at(-1)?.date;
  return oldest && shiftDate(oldest, -MATCH_WINDOW.after - 2);
}

function categoryTree(): { parent: Category; children: Category[] }[] {
  const all = state.snapshot.categories;
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);
  return all
    .filter((c) => !c.parentGuid)
    .sort(byName)
    .map((parent) => ({ parent, children: all.filter((c) => c.parentGuid === parent.guid).sort(byName) }));
}

const categoryName = (guid: string | null | undefined) =>
  state.snapshot.categories.find((c) => c.guid === guid)?.name ?? 'Uncategorized';

function ordersFor(charge: AmazonCharge): Load<Order[]> {
  const loads = charge.orders.map((o) => state.orders.get(o.id));
  const failed = loads.find((l) => l?.status === 'error');
  if (failed?.status === 'error') return failed;
  if (loads.some((l) => !l || l.status === 'loading')) return { status: 'loading' };
  return { status: 'ready', value: loads.map((l) => (l as { value: Order }).value) };
}

function planFor(m: MxCharge, orders: Order[]): Plan {
  return buildPlan(
    m.cents,
    orders,
    (item, i) => state.choices.get(`${m.guid}|${i}`) ?? store.rules[itemKey(item)] ?? m.categoryGuid ?? '',
  );
}

// ---------------------------------------------------------------------------
// Loading

async function loadAmazon(fresh = false) {
  const since = neededSince(mxCharges().parents);
  if (!since) return;
  state.amazon = { status: 'loading', since };
  update();
  const result = (await ask({ type: 'amazon:charges', since, fresh })) as ChargesResult;
  state.amazon = result.ok
    ? { status: 'ready', value: result.value, since }
    : { status: 'error', error: result.error, signedOut: result.signedOut, since };
  if (fresh) state.orders.clear();
  update();
  loadMatchedOrders(fresh, state.inline?.guids);
}

async function loadOrder(id: string, fresh = false) {
  const current = state.orders.get(id);
  if (current && (current.status === 'loading' || (current.status === 'ready' && !fresh))) return;
  state.orders.set(id, { status: 'loading' });
  update();
  const result = (await ask({ type: 'amazon:order', id, fresh })) as OrderResult;
  state.orders.set(
    id,
    result.ok ? { status: 'ready', value: result.value } : { status: 'error', error: result.error, signedOut: result.signedOut },
  );
  update();
}

// `first`: transactions to load before the rest (the open details drawer).
async function loadMatchedOrders(fresh = false, first: string[] = []) {
  if (state.amazon?.status !== 'ready') return;
  const { parents } = mxCharges();
  const matches = matchCharges(parents, state.amazon.value);
  // Orders for the drawer first, then ones that can still be categorized.
  const rank = (m: MxCharge) => (first.includes(m.guid) ? 0 : m.hasBeenSplit ? 2 : 1);
  const ordered = [...parents].sort((a, b) => rank(a) - rank(b));
  for (const m of ordered) {
    const charge = matches.get(m.guid);
    if (!charge || charge.kind === 'refund') continue;
    for (const o of charge.orders) await loadOrder(o.id, fresh);
  }
}

function maybeLoad() {
  if (!(state.open || state.inline) || !state.snapshot.hasSession) return;
  const since = neededSince(mxCharges().parents);
  if (!since || state.amazon?.status === 'loading') return;
  if (!state.amazon || (state.amazon.status === 'ready' && state.amazon.since! > since)) loadAmazon();
}

// ---------------------------------------------------------------------------
// Actions

async function run(guid: string, work: () => Promise<Note>) {
  state.busy.add(guid);
  state.confirming = undefined;
  state.notes.delete(guid);
  update();
  try {
    state.notes.set(guid, await work());
  } catch (err) {
    state.notes.set(guid, { tone: 'error', text: (err as Error).message });
  } finally {
    state.busy.delete(guid);
    update();
  }
}

const RELOAD_HINT = 'Reload Money Manager to see it in the transaction list.';

// What a transaction or split part gets, given the items it covers.
function changesFor(part: Part) {
  return {
    categoryGuid: part.categoryGuid,
    memo: store.writeMemos ? memoFor(part.titles) : undefined,
    description: store.writePayees ? payeeFor(part.titles) : undefined,
  };
}

function apply(m: MxCharge, plan: Plan) {
  return run(m.guid, async () => {
    if (plan.parts.length === 1) {
      await callMain({ op: 'recategorize', guid: m.guid, changes: changesFor(plan.parts[0]!) });
      store.applied[m.guid] = {
        kind: 'recategorize',
        at: Date.now(),
        prevCategoryGuid: m.categoryGuid,
        prevMemo: m.memo,
        prevDescription: String(m.raw.description ?? ''),
      };
    } else {
      await callMain({
        op: 'split',
        guid: m.guid,
        parts: plan.parts.map((p) => ({ cents: p.cents, ...changesFor(p) })),
      });
      store.applied[m.guid] = { kind: 'split', at: Date.now() };
    }
    for (const p of plan.items) store.rules[itemKey(p.item)] = p.categoryGuid;
    for (const key of [...state.choices.keys()]) if (key.startsWith(`${m.guid}|`)) state.choices.delete(key);
    await saveStore('rules', 'applied');
    const what = plan.parts.length === 1 ? `Set to ${categoryName(plan.parts[0]!.categoryGuid)}.` : `Split into ${plural(plan.parts.length, 'item')}.`;
    return { tone: 'ok', text: `${what} ${RELOAD_HINT}` };
  });
}

function undo(m: MxCharge) {
  return run(m.guid, async () => {
    const applied = store.applied[m.guid];
    if (m.hasBeenSplit) {
      await callMain({ op: 'unsplit', guid: m.guid });
    } else if (applied?.kind === 'recategorize' && applied.prevCategoryGuid) {
      await callMain({
        op: 'recategorize',
        guid: m.guid,
        changes: { categoryGuid: applied.prevCategoryGuid, memo: applied.prevMemo ?? null, description: applied.prevDescription || undefined },
      });
    }
    delete store.applied[m.guid];
    await saveStore('applied');
    return { tone: 'ok', text: `Undone. ${RELOAD_HINT}` };
  });
}

// ---------------------------------------------------------------------------
// Rendering

// While a category list is open, re-renders wait so typing isn't lost.
let comboOpen = false;
let renderDeferred = false;

function categoryOptions(): ComboOption[] {
  return categoryTree().flatMap(({ parent, children }) => [
    { value: parent.guid, label: parent.name, detail: 'general' },
    ...children.map((c) => ({ value: c.guid, label: c.name, detail: parent.name })),
  ]);
}

function categoryPicker(value: string, key: string, onChange: (guid: string) => void): HTMLElement {
  return combobox({
    value,
    key,
    label: 'Category',
    placeholder: 'Search categories…',
    options: categoryOptions(),
    onPick: onChange,
    onOpenChange: (open) => {
      comboOpen = open;
      if (!open && renderDeferred) queueMicrotask(update);
    },
  });
}

function orderLinks(charge: AmazonCharge) {
  return h(
    'div',
    { className: 'summary' },
    ...charge.orders.flatMap((o, i) => [
      i ? ' · ' : '',
      h('a', { className: 'link', href: AMAZON_ORDER_URL + o.id, target: '_blank', rel: 'noopener', textContent: `Order ${o.id} ↗` }),
    ]),
    charge.status === 'Pending' ? h('span', { className: 'pill warn', textContent: 'Pending at Amazon' }) : null,
  );
}

function actionRow(m: MxCharge, primary: HTMLButtonElement | null, confirmText: string, onConfirm: () => void) {
  const busy = state.busy.has(m.guid);
  const confirming = state.confirming === m.guid;
  const note = state.notes.get(m.guid);
  const row = h('div', { className: 'actions' });
  if (busy) row.append(h('span', { className: 'note', textContent: 'Working…' }));
  else if (confirming) {
    row.append(
      h('span', { className: 'note confirm', textContent: confirmText }),
      h('button', { className: 'btn', textContent: 'Cancel', 'data-key': `${m.guid}|cancel`, onclick: () => ((state.confirming = undefined), update()) }),
      h('button', { className: 'btn primary', textContent: 'Confirm', 'data-key': `${m.guid}|confirm`, onclick: onConfirm }),
    );
  } else {
    row.append(h('span', { className: `note ${note?.tone === 'error' ? 'error' : ''}`, textContent: note?.text ?? '' }));
    if (primary) row.append(primary);
  }
  return row;
}

function confirmButton(m: MxCharge, label: string, opts: { disabled?: boolean; danger?: boolean } = {}) {
  return h('button', {
    className: `btn ${opts.danger ? '' : 'primary'}`,
    textContent: label,
    disabled: !!opts.disabled,
    'data-key': `${m.guid}|primary`,
    onclick: () => {
      state.confirming = m.guid;
      state.notes.delete(m.guid);
      update();
    },
  });
}

function splitBody(m: MxCharge, charge: AmazonCharge, orders: Order[]): HTMLElement[] {
  const plan = planFor(m, orders);
  if (!plan.items.length) return [h('p', { className: 'callout warn', textContent: "Couldn't find any items on the order page." })];

  const table = h('table');
  plan.items.forEach((p, i) => {
    const titleCell = h(
      'td',
      { className: 'title' },
      p.item.asin
        ? h('a', { href: `https://www.amazon.com/dp/${p.item.asin}`, target: '_blank', rel: 'noopener', textContent: p.item.title })
        : p.item.title,
      h('span', {
        className: 'sub',
        textContent: `${p.item.quantity > 1 ? `${p.item.quantity} × ` : ''}${money(p.item.unitCents)}${orders.length > 1 ? ` · ${p.orderId}` : ''}`,
      }),
    );
    const select = categoryPicker(p.categoryGuid, `${m.guid}|cat|${i}`, (guid) => {
      state.choices.set(`${m.guid}|${i}`, guid);
      if (state.confirming === m.guid) state.confirming = undefined;
      update();
    });
    table.append(h('tr', {}, titleCell, h('td', { className: 'num', textContent: money(p.cents) }), h('td', { className: 'cat' }, select)));
  });

  const missing = plan.items.some((p) => !p.categoryGuid);
  const summary = h(
    'div',
    { className: 'summary' },
    ...plan.byCategory.flatMap((p, i) => [i ? ' + ' : '', h('b', { textContent: categoryName(p.categoryGuid) }), ` ${money(p.cents)}`]),
    ` = ${money(m.cents)}`,
  );
  const pending = m.pending || charge.status === 'Pending';
  const single = plan.parts.length === 1;
  const wanted = single ? changesFor(plan.parts[0]!) : undefined;
  const unchanged =
    !!wanted &&
    wanted.categoryGuid === m.categoryGuid &&
    (wanted.memo === undefined || wanted.memo === m.memo) &&
    (wanted.description === undefined || wanted.description === m.raw.description);
  const label = single ? `Set category to ${categoryName(plan.parts[0]!.categoryGuid)}` : `Split into ${plan.parts.length} items`;
  const primary = confirmButton(m, label, { disabled: missing || pending || unchanged });
  const confirmText = single
    ? `Change this ${money(m.cents)} charge to ${categoryName(plan.parts[0]!.categoryGuid)}?`
    : `Split ${money(m.cents)} into ${plan.parts.length} items (${plan.byCategory.map((p) => `${categoryName(p.categoryGuid)} ${money(p.cents)}`).join(', ')})?`;

  return [
    table,
    summary,
    plan.approximate
      ? h('p', {
          className: 'callout warn',
          textContent:
            "This charge doesn't equal the order total (the order was charged in parts, or partly paid with points or a gift card), so each item's share is an estimate based on price.",
        })
      : null,
    pending ? h('p', { className: 'callout warn', textContent: 'Wait until this charge posts: the bank may replace a pending transaction and lose the split.' }) : null,
    actionRow(m, primary, confirmText, () => apply(m, plan)),
  ].filter((n) => n !== null);
}

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// The card's one-line status and, for the body, what to show when expanded.
function cardParts(m: MxCharge, charge: AmazonCharge | undefined, partCount: number) {
  const applied = store.applied[m.guid];
  const amazon = state.amazon;
  const pill = (text: string, tone = '') => h('span', { className: `pill ${tone}`, textContent: text });
  const body: HTMLElement[] = [];
  const note = (text: string) => body.push(h('p', { className: 'summary', textContent: text }));

  if (m.hasBeenSplit || applied) {
    if (charge) body.push(orderLinks(charge));
    if (m.hasBeenSplit && !applied) note('Already split in Money Manager. Unsplit it first to split it by item.');
    const canUndo = m.hasBeenSplit || (applied?.kind === 'recategorize' && !!applied.prevCategoryGuid);
    const primary = canUndo ? confirmButton(m, applied ? 'Undo' : 'Unsplit', { danger: true }) : null;
    const text = m.hasBeenSplit
      ? `Merge the ${plural(partCount, 'part')} back into one ${money(m.cents)} transaction?`
      : `Put this back to ${categoryName(applied?.prevCategoryGuid)}?`;
    body.push(actionRow(m, primary, text, () => undo(m)));
    return { pill: pill(m.hasBeenSplit ? `Split · ${plural(partCount, 'part')}` : 'Done', 'ok'), preview: '', body };
  }

  if (!charge) {
    if (amazon?.status === 'loading') return { pill: pill('Looking up…'), preview: '', body };
    if (amazon?.status !== 'ready') return { pill: pill('–'), preview: '', body };
    note('No Amazon charge or refund with this amount and date on your Amazon account.');
    return { pill: pill('No match', 'warn'), preview: '', body };
  }

  body.push(orderLinks(charge));
  if (charge.kind === 'refund') {
    note('Categorizing refunds by item is not supported yet.');
    return { pill: pill('Refund'), preview: '', body };
  }
  if (!charge.orders.length) {
    note('Amazon lists no order for this charge.');
    return { pill: pill('No order', 'warn'), preview: '', body };
  }

  const orders = ordersFor(charge);
  if (orders.status === 'loading') {
    note('Loading order details…');
    return { pill: pill('Loading…'), preview: '', body };
  }
  if (orders.status === 'error') {
    body.push(
      h(
        'p',
        { className: 'callout danger' },
        `Couldn't load the order: ${orders.error} `,
        h('button', { className: 'link', textContent: 'Retry', onclick: () => charge.orders.forEach((o) => loadOrder(o.id, true)) }),
      ),
    );
    return { pill: pill("Couldn't load", 'danger'), preview: '', body };
  }
  body.push(...splitBody(m, charge, orders.value));
  const items = orders.value.flatMap((o) => o.items);
  return {
    pill: m.pending || charge.status === 'Pending' ? pill('Pending', 'warn') : pill(plural(items.length, 'item')),
    preview: items.map((i) => i.title).join(' · '),
    body,
  };
}

// In the panel a card collapses to one line; in the details drawer
// (`inline`) it's always open and just shows the body.
function card(m: MxCharge, charge: AmazonCharge | undefined, partCount: number, inline = false): HTMLElement {
  const { pill, preview, body } = cardParts(m, charge, partCount);
  if (inline) {
    return h(
      'div',
      { className: 'inline-card', 'data-guid': m.guid },
      h('div', { className: 'inline-head' }, h('span', { className: 'desc', textContent: preview }), pill),
      ...body,
    );
  }
  const expanded = state.expanded.has(m.guid) && body.length > 0;
  const head = h(
    'button',
    {
      className: 'card-head',
      'aria-expanded': String(expanded),
      'data-key': `${m.guid}|head`,
      disabled: !body.length,
      onclick: () => {
        if (!state.expanded.delete(m.guid)) state.expanded.add(m.guid);
        update();
      },
    },
    h('span', { className: 'chevron', textContent: body.length ? (expanded ? '▾' : '▸') : '' }),
    h('span', { className: 'date', textContent: shortDate(m.date) }),
    h('span', { className: 'amount', textContent: `${m.type === CREDIT ? '+' : ''}${money(m.cents)}` }),
    h('span', { className: 'desc', textContent: preview || `${String(m.raw.description ?? '')} · ${categoryName(m.categoryGuid)}` }),
    pill,
  );
  return h('div', { className: `card ${expanded ? 'expanded' : ''}`, 'data-guid': m.guid }, head, expanded ? h('div', { className: 'card-body' }, ...body) : null);
}

let ui: { host: HTMLElement; panel: HTMLElement; bar: HTMLElement; content: HTMLElement } | undefined;

function statusMessage(parents: MxCharge[], matched: number): Node | string {
  const amazon = state.amazon;
  let message: Node | string;
  if (!state.snapshot.hasSession) message = 'Waiting for Money Manager to load…';
  else if (!parents.length) message = 'No Amazon transactions in view. Pick a date range with Amazon charges on the Transactions tab.';
  else if (!amazon || amazon.status === 'loading') message = `${plural(parents.length, 'Amazon transaction')} in view. Loading your Amazon payments…`;
  else if (amazon.status === 'error') {
    message = amazon.signedOut
      ? h(
          'span',
          {},
          'Not signed in to Amazon. ',
          h('a', { className: 'link', href: AMAZON_PAYMENTS_URL, target: '_blank', rel: 'noopener', textContent: 'Sign in ↗' }),
          ', then click Refresh.',
        )
      : `Couldn't load Amazon payments: ${amazon.error}`;
  } else message = `${plural(parents.length, 'Amazon transaction')} in view · ${matched} matched to Amazon orders`;
  return message;
}

function renderBar(parents: MxCharge[], matched: number) {
  const amazon = state.amazon;
  const option = (key: 'writeMemos' | 'writePayees', label: string, title: string) => {
    const box = h('input', { type: 'checkbox', checked: store[key], 'data-key': key });
    box.addEventListener('change', () => {
      store[key] = box.checked;
      saveStore(key);
      update();
    });
    return h('label', { className: 'option', title }, box, label);
  };
  ui!.bar.replaceChildren(
    h('span', { className: 'message' }, statusMessage(parents, matched)),
    option('writePayees', 'Item in payee', 'Single-item charges and split parts become "Amazon - <item>"'),
    option('writeMemos', 'Item names in memo', 'Full item names go in the memo'),
    h('button', {
      className: 'btn',
      textContent: 'Refresh',
      disabled: amazon?.status === 'loading' || !parents.length,
      'data-key': 'refresh',
      onclick: () => loadAmazon(true),
    }),
  );
}

// Re-render into `root`, keeping focus on the same control. preventScroll:
// a plain focus() also scrolls BECU's page around the Money Manager frame.
function keepingFocus(root: ShadowRoot | undefined, render: () => void) {
  const key = root?.activeElement?.getAttribute('data-key');
  render();
  if (key) root?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}

function update() {
  if (!ui) return;
  ui.panel.hidden = !state.open;
  renderDeferred = comboOpen;
  if (comboOpen) return;

  const { parents, parts } = mxCharges();
  const matches = state.amazon?.status === 'ready' ? matchCharges(parents, state.amazon.value) : new Map<string, AmazonCharge>();

  if (state.open) {
    keepingFocus(shadow, () => {
      renderBar(parents, matches.size);
      ui!.content.replaceChildren(
        ...(parents.length
          ? parents.map((m) => card(m, matches.get(m.guid), parts.get(m.guid) ?? 0))
          : [h('p', { className: 'empty', textContent: 'Amazon charges on your cards will show up here.' })]),
      );
    });
  }

  const inline = state.inline;
  if (inline?.section.isConnected) {
    keepingFocus(inline.root, () => {
      const shown = parents.filter((m) => inline.guids.includes(m.guid));
      const ready = state.amazon?.status === 'ready';
      inline.section.replaceChildren(
        ...(ready && shown.length
          ? shown.map((m) => card(m, matches.get(m.guid), parts.get(m.guid) ?? 0, true))
          : [h('p', { className: 'summary' }, statusMessage(parents, matches.size))]),
      );
    });
  }
}

// Amazon transactions (split parts map to their parent) with this amount
// on or next to this date, closest first. Used by the details drawer.
function findTransactions(cents: number, date: string): string[] {
  const all = state.snapshot.transactions.flatMap((raw) => toMxCharge(raw) ?? []);
  const days = (m: MxCharge) => Math.abs(Date.parse(m.date) - Date.parse(date)) / 86_400_000;
  const guids = all
    .filter((m) => m.cents === cents && days(m) <= 1)
    .sort((a, b) => days(a) - days(b))
    .map((m) => m.parentGuid ?? m.guid);
  return [...new Set(guids)];
}

// The details drawer's section opened (or closed, with undefined).
function attachInline(inline: Inline | undefined) {
  state.inline = inline;
  if (!inline) return;
  update();
  maybeLoad();
  loadMatchedOrders(false, inline.guids);
}

let shadow: ShadowRoot | undefined;

function open() {
  state.open = true;
  update();
  maybeLoad();
}

function close() {
  state.open = false;
  state.confirming = undefined;
  update();
  toolbarButton()?.button.focus({ preventScroll: true });
}

export async function mountPanel() {
  await loadStore();
  const host = h('div', { id: 'becu-mx-amz' });
  shadow = host.attachShadow({ mode: 'closed' });
  const bar = h('div', { className: 'bar' });
  const content = h('div', { className: 'content' });
  const panel = h(
    'section',
    { className: 'panel', 'aria-label': 'Amazon items' },
    h(
      'header',
      {},
      h('h2', { textContent: 'Amazon items' }),
      h('span', { className: 'spacer' }),
      h('button', { className: 'icon', textContent: '×', 'aria-label': 'Close', onclick: close }),
    ),
    bar,
    content,
  );
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (state.confirming) {
      state.confirming = undefined;
      update();
    } else close();
  });
  shadow.append(h('style', { textContent: STYLE }), panel);
  document.body.append(host);
  ui = { host, panel, bar, content };

  watchToolbar(() => (state.open ? close() : open()), update);
  const recheckDrawer = watchDrawer(INLINE_STYLE, ({ cents, date }) => findTransactions(cents, date), attachInline);
  connectBridge((snapshot) => {
    state.snapshot = snapshot;
    update();
    recheckDrawer();
    maybeLoad();
    loadMatchedOrders(false, state.inline?.guids);
  });
  update();
}
