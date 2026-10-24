import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Inline } from '@/lib/drawer';
import { readDrawer, watchDrawer } from '@/lib/drawer';

const file = join(import.meta.dirname, '..', 'samples', 'transaction_details.html');

// The row's shadow root is closed; open it so the test can click the button.
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init) {
  return attachShadow.call(this, { ...init, mode: 'open' });
};

describe.skipIf(!existsSync(file))('details drawer', () => {
  it('adds the button only for a match, and expands the section in place', () => {
    document.body.innerHTML = readFileSync(file, 'utf8');
    const drawer = document.querySelector('.mx-drawer')!;
    expect(readDrawer(drawer)).toEqual({ cents: 1873, date: '2026-10-21' });

    let found: string[] = [];
    const attached: (Inline | undefined)[] = [];
    const recheck = watchDrawer('', () => found, (i) => attached.push(i));
    expect(document.querySelector('[data-becu-mx-amz]')).toBeNull();

    found = ['TRN-1'];
    recheck();
    const host = document.querySelector('[data-becu-mx-amz]')!;
    const button = host.shadowRoot!.querySelector('button')!;
    expect(button.textContent).toBe('Update With Item Details');

    button.click();
    expect(button.textContent).toBe('Hide Item Details');
    expect(attached.at(-1)?.guids).toEqual(['TRN-1']);
    expect(attached.at(-1)?.section.hidden).toBe(false);
    expect(drawer.isConnected).toBe(true); // the drawer stays open

    button.click();
    expect(attached.at(-1)).toBeUndefined();
  });
});
