// A text box you can type in to filter a list of options (ARIA combobox
// pattern). Click or start typing to open the list; arrow keys and Enter to
// pick; Escape to cancel.

export interface ComboOption {
  value: string;
  label: string;
  detail?: string; // shown muted after the label (e.g. the parent category)
}

export interface ComboboxProps {
  value: string;
  key: string; // data-key, so the panel can restore focus after a re-render
  label: string;
  placeholder: string;
  options: ComboOption[];
  onPick: (value: string) => void;
  // The panel holds re-renders while a list is open.
  onOpenChange: (open: boolean) => void;
}

let nextId = 0;

const matches = (o: ComboOption, words: string[]) => {
  const text = `${o.label} ${o.detail ?? ''}`.toLowerCase();
  return words.every((w) => text.includes(w));
};

export function combobox(props: ComboboxProps): HTMLElement {
  const id = `becu-mx-amz-combo-${nextId++}`;
  const current = props.options.find((o) => o.value === props.value);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'combo-input';
  input.value = current?.label ?? '';
  input.placeholder = props.placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', props.label);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  input.setAttribute('data-key', props.key);

  const list = document.createElement('ul');
  list.id = id;
  list.className = 'combo-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const wrap = document.createElement('div');
  wrap.className = 'combo';
  wrap.append(input, list);

  let open = false;
  let typed = false; // until the user types, show every option
  let shown: ComboOption[] = [];
  let active = -1;

  function render() {
    const words = typed ? input.value.toLowerCase().split(/\s+/).filter(Boolean) : [];
    shown = props.options.filter((o) => matches(o, words));
    if (active >= shown.length) active = shown.length - 1;
    list.replaceChildren(
      ...shown.map((o, i) => {
        const li = document.createElement('li');
        li.id = `${id}-${i}`;
        li.className = `combo-option${i === active ? ' active' : ''}${o.value === props.value ? ' current' : ''}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        li.append(o.label);
        if (o.detail) {
          const detail = document.createElement('span');
          detail.className = 'combo-detail';
          detail.textContent = o.detail;
          li.append(detail);
        }
        // mousedown, not click, so the input keeps focus.
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(o);
        });
        return li;
      }),
    );
    if (!shown.length) {
      const empty = document.createElement('li');
      empty.className = 'combo-empty';
      empty.textContent = 'No matching category';
      list.append(empty);
    }
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${id}-${active}`);
      scrollToActive();
    } else input.removeAttribute('aria-activedescendant');
  }

  // Not scrollIntoView: that also scrolls every page around the frame.
  function scrollToActive() {
    const li = list.children[active] as HTMLElement | undefined;
    if (!li) return;
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }
  }

  function openList() {
    if (open) return;
    open = true;
    typed = false;
    active = props.options.findIndex((o) => o.value === props.value);
    input.setAttribute('aria-expanded', 'true');
    list.hidden = false;
    props.onOpenChange(true);
    render();
    input.select();
  }

  function closeList(restore = true) {
    if (!open) return;
    open = false;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (restore) input.value = current?.label ?? '';
    props.onOpenChange(false);
  }

  function pick(o: ComboOption) {
    input.value = o.label;
    closeList(false);
    if (o.value !== props.value) props.onPick(o.value);
  }

  input.addEventListener('click', openList);
  input.addEventListener('input', () => {
    openList();
    typed = true;
    active = 0;
    render();
  });
  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!open) return openList();
        active = e.key === 'ArrowDown' ? Math.min(active + 1, shown.length - 1) : Math.max(active - 1, 0);
        return render();
      case 'Enter':
        if (open && shown[active]) {
          e.preventDefault();
          pick(shown[active]!);
        }
        return;
      case 'Escape':
        if (open) {
          e.stopPropagation(); // don't close the whole panel
          closeList();
        }
        return;
      case 'Tab':
        if (open && typed && shown[active]) pick(shown[active]!);
        else closeList();
        return;
    }
  });
  input.addEventListener('blur', () => closeList());

  return wrap;
}
