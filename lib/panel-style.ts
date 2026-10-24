export const STYLE = `
  :host {
    all: initial;
    --bg: #ffffff;
    --fg: #1d2433;
    --muted: #667085;
    --border: #e4e7ec;
    --subtle: #f5f6f8;
    --accent: #0b5394;
    --accent-hover: #094377;
    --accent-fg: #ffffff;
    --ok: #137333;
    --ok-bg: #e7f4ea;
    --warn: #8a5300;
    --warn-bg: #fff4dd;
    --danger: #b42318;
    --danger-bg: #fdecea;
    --focus: #2f7de1;
    --shadow: 0 8px 32px rgba(16, 24, 40, .24), 0 2px 6px rgba(16, 24, 40, .12);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--fg);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --bg: #1c1f26;
      --fg: #e6e8ec;
      --muted: #9aa3b2;
      --border: #343a46;
      --subtle: #252a33;
      --accent: #4c8fd6;
      --accent-hover: #6aa5e3;
      --accent-fg: #0d1117;
      --ok: #6fcf8a;
      --ok-bg: #1d3325;
      --warn: #f0b95b;
      --warn-bg: #3a2e17;
      --danger: #f28b82;
      --danger-bg: #3b1f1d;
      --focus: #79b0ff;
      --shadow: 0 8px 32px rgba(0, 0, 0, .55);
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, select, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* Panel shell */
  /* Panel shell */
  .panel {
    position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
    width: min(620px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
    display: flex; flex-direction: column;
    background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow);
    overflow: hidden;
  }
  header {
    display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px;
    border-bottom: 1px solid var(--border);
  }
  h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .spacer { flex: 1; }
  .icon {
    width: 28px; height: 28px; display: grid; place-items: center;
    border: 0; border-radius: 6px; background: transparent; color: var(--muted);
    font-size: 18px; line-height: 1; cursor: pointer;
  }
  .icon:hover { background: var(--subtle); color: var(--fg); }
  .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 8px 16px; border-bottom: 1px solid var(--border); }
  .bar .message { flex: 1; min-width: 200px; color: var(--muted); font-size: 12px; }
  .content { overflow: auto; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .empty { color: var(--muted); font-size: 12px; text-align: center; padding: 16px; }

  /* One Money Manager transaction */
  .card { flex-shrink: 0; border: 1px solid var(--border); border-radius: 8px; }
  .card.expanded { border-color: var(--muted); }
  .card-head {
    width: 100%; display: grid; grid-template-columns: 12px 48px 76px minmax(0, 1fr) auto; align-items: center; gap: 8px;
    padding: 7px 10px; border: 0; border-radius: 7px; background: var(--subtle); text-align: left; cursor: pointer;
  }
  .card.expanded .card-head { border-radius: 7px 7px 0 0; }
  .card-head:hover:not(:disabled) { background: var(--border); }
  .card-head:disabled { cursor: default; color: inherit; }
  .card-head .chevron { color: var(--muted); font-size: 11px; }
  .card-head .date { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .card-head .amount { font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .card-head .desc { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-body { padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 8px; }
  .pill {
    white-space: nowrap; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
    background: var(--bg); color: var(--muted); border: 1px solid var(--border);
  }
  .pill.ok { background: var(--ok-bg); color: var(--ok); border-color: transparent; }
  .pill.warn { background: var(--warn-bg); color: var(--warn); border-color: transparent; }
  .pill.danger { background: var(--danger-bg); color: var(--danger); border-color: transparent; }

  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { padding: 4px 6px 4px 0; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  td.title { overflow-wrap: anywhere; }
  td.title a { color: inherit; text-decoration: none; }
  td.title a:hover { text-decoration: underline; }
  td.title .sub { display: block; color: var(--muted); font-size: 11px; }
  td.cat { width: 190px; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  select {
    width: 100%; min-height: 28px; padding: 2px 6px;
    border: 1px solid var(--border); border-radius: 6px; background: var(--bg);
  }
  .summary { font-size: 12px; color: var(--muted); }
  .summary b { color: var(--fg); font-weight: 600; }
  .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .actions .note { flex: 1; min-width: 160px; font-size: 12px; color: var(--muted); }
  .actions .note.confirm { color: var(--fg); font-weight: 600; }
  .actions .note.error { color: var(--danger); }
  .callout { margin: 0; padding: 6px 10px; border-radius: 6px; font-size: 12px; }
  .callout.warn { background: var(--warn-bg); color: var(--warn); }
  .callout.danger { background: var(--danger-bg); color: var(--danger); }
  .callout.ok { background: var(--ok-bg); color: var(--ok); }

  .option { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .btn {
    min-height: 28px; padding: 3px 12px; font-size: 12px; border-radius: 6px; cursor: pointer; font-weight: 600;
    border: 1px solid var(--border); background: var(--bg);
  }
  .btn:hover:not(:disabled) { background: var(--subtle); }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn.danger { background: var(--danger); border-color: var(--danger); color: var(--bg); }
  .link { border: 0; background: none; padding: 0; color: var(--accent); cursor: pointer; font-size: 12px; font-weight: 600; text-decoration: none; }

  /* Category search box */
  .combo { position: relative; }
  .combo-input {
    width: 100%; min-height: 28px; padding: 3px 8px 3px 26px;
    border: 1px solid var(--border); border-radius: 6px; background-color: var(--bg);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a94a6' stroke-width='1.6'%3E%3Ccircle cx='7' cy='7' r='4.5'/%3E%3Cpath d='M10.5 10.5 14 14'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: 7px center; background-size: 13px;
    text-overflow: ellipsis;
  }
  .combo-input:hover { border-color: var(--muted); }
  .combo-input[aria-expanded="true"] { border-color: var(--accent); }
  .combo-input::placeholder { color: var(--muted); }
  .combo-list {
    position: absolute; top: calc(100% + 2px); right: 0; z-index: 5;
    min-width: 100%; width: 260px; max-height: 240px; overflow: auto;
    margin: 0; padding: 4px 0; list-style: none;
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow);
  }
  .combo-option { display: flex; align-items: baseline; gap: 6px; padding: 4px 10px; cursor: pointer; }
  .combo-option:hover, .combo-option.active { background: var(--subtle); }
  .combo-option.active { box-shadow: inset 2px 0 var(--accent); }
  .combo-option.current { font-weight: 600; }
  .combo-detail { margin-left: auto; color: var(--muted); font-size: 11px; font-weight: 400; white-space: nowrap; }
  .combo-empty { padding: 6px 10px; color: var(--muted); }
`;

// The section in Money Manager's (always light) Transaction Details drawer.
export const INLINE_STYLE = `${STYLE}
  :host {
    --bg: #ffffff;
    --fg: #1d2433;
    --muted: #667085;
    --border: #e4e7ec;
    --subtle: #f5f6f8;
    --accent: #0b5394;
    --accent-hover: #094377;
    --accent-fg: #ffffff;
    --ok: #137333;
    --ok-bg: #e7f4ea;
    --warn: #8a5300;
    --warn-bg: #fff4dd;
    --danger: #b42318;
    --danger-bg: #fdecea;
    --focus: #2f7de1;
    --shadow: 0 8px 32px rgba(16, 24, 40, .24), 0 2px 6px rgba(16, 24, 40, .12);
    font-size: 13px;
  }
  .inline-row { padding: 0 20px 15px; background: #ffffff; }
  .inline { margin-top: 12px; display: flex; flex-direction: column; gap: 14px; }
  .inline-card { display: flex; flex-direction: column; gap: 8px; }
  .inline-card + .inline-card { padding-top: 14px; border-top: 1px solid var(--border); }
  .inline-head { display: flex; align-items: center; gap: 8px; }
  .inline-head .desc { flex: 1; min-width: 0; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
