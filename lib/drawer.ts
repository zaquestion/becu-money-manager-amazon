// Adds an "Update With Item Details" button to Money Manager's Transaction
// Details drawer, under the payee and amount. It expands the item details
// right there in the drawer (rendered by the panel module) rather than
// sending you somewhere else. The drawer doesn't expose the transaction's
// guid, so it's found by the amount and date shown.
import { parseCents, parseDate } from './amazon/parse';

const ROW_ATTR = 'data-becu-mx-amz';
const TEAL = 'rgb(0, 124, 137)'; // Money Manager's link/button color
const SHOW = 'Update With Item Details';
const HIDE = 'Hide Item Details';

export interface DrawerTarget {
  cents: number;
  date: string; // YYYY-MM-DD
}

export interface Inline {
  // Shadow root holding the section, for focus handling and styles.
  root: ShadowRoot;
  section: HTMLElement;
  guids: string[];
}

export function readDrawer(drawer: Element): DrawerTarget | undefined {
  const cents = parseCents(drawer.querySelector('[data-testid="media-block-right-container"]')?.textContent ?? '');
  const date = parseDate(drawer.querySelector('[aria-label^="Select a Date"]')?.textContent ?? '');
  return cents === undefined || !date ? undefined : { cents: Math.abs(cents), date };
}

interface Row {
  host: HTMLElement;
  button: HTMLButtonElement;
  inline: Inline;
}

// The open drawer's target, kept so the section reopens if Money Manager
// re-renders the drawer.
let expandedKey: string | undefined;
const keyOf = (t: DrawerTarget) => `${t.cents}|${t.date}`;

function buildRow(style: string, guids: string[], onToggle: (row: Row) => void): Row {
  const host = document.createElement('div');
  host.setAttribute(ROW_ATTR, '');
  const root = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = SHOW;
  button.setAttribute('aria-expanded', 'false');
  Object.assign(button.style, {
    padding: '6px 14px',
    border: `1px solid ${TEAL}`,
    borderRadius: '4px',
    background: 'transparent',
    color: TEAL,
    font: '13px InterSemibold, Helvetica, Arial, sans-serif',
    cursor: 'pointer',
  });
  const section = document.createElement('div');
  section.className = 'inline';
  section.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = 'inline-row';
  wrap.append(button, section);
  const css = document.createElement('style');
  css.textContent = style;
  root.append(css, wrap);
  const row: Row = { host, button, inline: { root, section, guids } };
  button.addEventListener('click', (e) => {
    e.preventDefault();
    onToggle(row);
  });
  return row;
}

function setExpanded(row: Row, expanded: boolean) {
  row.button.textContent = expanded ? HIDE : SHOW;
  row.button.setAttribute('aria-expanded', String(expanded));
  row.inline.section.hidden = !expanded;
}

// `find` returns the matching Amazon transactions (empty: no button).
// `attach` is called with the section to render into while expanded, and
// with undefined when it collapses. Returns a function to re-check, e.g.
// when more transactions have loaded.
export function watchDrawer(
  style: string,
  find: (target: DrawerTarget) => string[],
  attach: (inline: Inline | undefined) => void,
) {
  const rows = new WeakMap<Element, Row>();
  let attached: Row | undefined;

  const setAttached = (row: Row | undefined) => {
    if (attached === row) return;
    attached = row;
    attach(row?.inline);
  };

  const check = () => {
    let seen: Row | undefined;
    for (const drawer of document.querySelectorAll('.mx-drawer')) {
      if (!/Transaction Details/i.test(drawer.querySelector('header h2')?.textContent ?? '')) continue;
      const target = readDrawer(drawer);
      const guids = target ? find(target) : [];
      let row = rows.get(drawer);
      if (row && !row.host.isConnected) row = undefined;
      if (!guids.length || !target) {
        row?.host.remove();
        continue;
      }
      if (!row) {
        const media = drawer.querySelector('[data-testid="media-block-right-container"]')?.closest('ul');
        if (!media) continue;
        row = buildRow(style, guids, (r) => {
          const expand = r.inline.section.hidden;
          expandedKey = expand ? keyOf(target) : undefined;
          setExpanded(r, expand);
          setAttached(expand ? r : undefined);
        });
        rows.set(drawer, row);
        media.after(row.host);
        if (expandedKey === keyOf(target)) setExpanded(row, true);
      }
      row.inline.guids = guids;
      if (!row.inline.section.hidden) seen = row;
    }
    // Drawer closed, re-rendered, or collapsed.
    if (!seen && !attached?.host.isConnected) expandedKey = undefined;
    setAttached(seen);
  };
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
  return check;
}
