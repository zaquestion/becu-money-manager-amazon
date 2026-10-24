import { describe, expect, it } from 'vitest';
import { combobox } from '@/lib/combobox';

const options = [
  { value: 'pets', label: 'Pets', detail: 'general' },
  { value: 'food', label: 'Pet Food', detail: 'Pets' },
  { value: 'auto', label: 'Service & Parts', detail: 'Auto & Transport' },
];

function setup(value = 'pets') {
  const picked: string[] = [];
  const opens: boolean[] = [];
  const el = combobox({
    value, key: 'k', label: 'Category', placeholder: 'Search categories…', options,
    onPick: (v) => picked.push(v), onOpenChange: (o) => opens.push(o),
  });
  document.body.replaceChildren(el);
  const input = el.querySelector('input')!;
  const list = el.querySelector('ul')!;
  const key = (k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  return { input, list, picked, opens, key, type };
}

describe('combobox', () => {
  it('shows the current name and opens to every option on click', () => {
    const c = setup();
    expect(c.input.value).toBe('Pets');
    c.input.click();
    expect(c.list.hidden).toBe(false);
    expect(c.list.querySelectorAll('[role=option]')).toHaveLength(3);
    expect(c.opens).toEqual([true]);
  });

  it('filters on label and parent, and picks with Enter', () => {
    const c = setup();
    c.type('auto serv');
    expect([...c.list.querySelectorAll('[role=option]')].map((li) => li.firstChild?.textContent)).toEqual(['Service & Parts']);
    c.key('Enter');
    expect(c.picked).toEqual(['auto']);
    expect(c.list.hidden).toBe(true);
  });

  it('moves with arrow keys and picks with the mouse', () => {
    const c = setup();
    c.type('pet');
    c.key('ArrowDown');
    expect(c.input.getAttribute('aria-activedescendant')).toMatch(/-1$/);
    c.list.querySelectorAll('[role=option]')[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(c.picked).toEqual(['food']);
  });

  it('Escape restores the name without picking', () => {
    const c = setup();
    c.type('xyz');
    expect(c.list.textContent).toContain('No matching category');
    c.key('Escape');
    expect(c.input.value).toBe('Pets');
    expect(c.picked).toEqual([]);
    expect(c.opens).toEqual([true, false]);
  });
});
