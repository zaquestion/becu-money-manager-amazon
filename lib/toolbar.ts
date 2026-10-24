// Puts an "Amazon items" button next to Money Manager's own "Export CSV" button
// on the Transactions tab. The button is a clone of the export button so it
// picks up the app's styling. The app is a React SPA that re-renders and
// swaps tabs, so a MutationObserver re-adds the button whenever it disappears.
// (Adapted from becu_import's lib/toolbar.ts.)

const EXPORT_SELECTOR = '[data-testid="Export-transactions-to-CSV-button"]';
const TEST_ID = 'Amazon-orders-button';
// becu_import's button, which may sit in the same toolbar.
const OTHER_TEST_IDS = [TEST_ID, 'Import-transactions-from-CSV-button'];
const TAB_SELECTOR = 'button[data-testid="transactions"]';

export interface ToolbarButton {
  button: HTMLButtonElement;
  label: HTMLElement;
}

let current: ToolbarButton | undefined;
let onTransactions = false;
let warned = false;

export function toolbarButton(): ToolbarButton | undefined {
  return current?.button.isConnected ? current : undefined;
}

// True while the Transactions tab is selected: its export button is on the
// page, or (should that button change) its tab is styled as the selected one.
export function transactionsTabShown(): boolean {
  return onTransactions;
}

// The tabs carry no aria-selected; only the generated class differs. The
// unselected tabs share one class, so the selected tab is the odd one out.
function transactionsTabSelected(): boolean {
  const tab = document.querySelector<HTMLButtonElement>(TAB_SELECTOR);
  if (!tab) return false;
  for (let el = tab.parentElement; el && el !== document.body; el = el.parentElement) {
    const others = [...el.querySelectorAll<HTMLButtonElement>('button[data-testid][aria-label]')].filter(
      (b) => b !== tab && !b.closest(EXPORT_SELECTOR) && !OTHER_TEST_IDS.includes(b.getAttribute('data-testid') ?? ''),
    );
    if (others.length < 2) continue;
    const classes = others.map((b) => b.className);
    return classes.every((c) => c === classes[0]) && classes[0] !== tab.className;
  }
  return false;
}

function build(exportBtn: HTMLButtonElement, onClick: () => void): ToolbarButton | undefined {
  // The export button sits in its own spacing wrapper; clone that so the gap matches.
  const parent = exportBtn.parentElement;
  const item = parent && parent.children.length === 1 ? parent : exportBtn;
  const clone = item.cloneNode(true) as HTMLElement;
  const button = clone instanceof HTMLButtonElement ? clone : clone.querySelector('button');
  if (!button) return;

  // The text goes in the last leaf element after the icon (it can be empty
  // while the app is still rendering or in a compact layout).
  const leaves = [...button.querySelectorAll<HTMLElement>('*')].filter(
    (el) => !el.children.length && !el.closest('svg'),
  );
  const label = leaves.at(-1);
  if (!label) {
    if (!warned) console.debug('[becu-mx-amz] export button has no label element; not adding the Amazon items button');
    warned = true;
    return;
  }

  button.setAttribute('data-testid', TEST_ID);
  button.removeAttribute('aria-expanded');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', 'Split Amazon charges by item');
  label.textContent = 'Amazon items';
  button.querySelector('svg')?.remove();

  button.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  item.after(clone);
  return { button, label };
}

export function watchToolbar(onClick: () => void, onChange: () => void) {
  const check = () => {
    const exportBtn = document.querySelector<HTMLButtonElement>(EXPORT_SELECTOR);
    const shown = !!exportBtn || transactionsTabSelected();
    let changed = shown !== onTransactions;
    onTransactions = shown;
    if (!toolbarButton()) {
      if (current) changed = true;
      current = exportBtn ? build(exportBtn, onClick) : undefined;
      if (current) changed = true;
    }
    if (changed) onChange();
  };
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
  check();
}
