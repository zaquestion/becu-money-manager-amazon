# Amazon Orders for BECU Money Manager

Chromium extension (TypeScript + [WXT](https://wxt.dev)) that shows the items
behind each Amazon charge in BECU Money Manager (MX's widget at
`widgets.moneydesktop.com`), and splits or recategorizes the charge by item.
Companion to `becu_import`.

## Build & load

```sh
pnpm install
pnpm build          # or `pnpm dev` for live reload
pnpm test
```

Open `chrome://extensions`, enable Developer mode, click **Load unpacked** and
pick `.output/chrome-mv3`.

## Use

1. Be signed in to amazon.com in the same browser profile.
2. In Money Manager, open Transactions and click **Amazon items** (next to
   Export CSV, or bottom-right if it can't be placed there).
3. Each Amazon charge in view is matched to your Amazon payments and shows the
   order's items. Pick a category per item, then **Split into N categories**
   (or **Set category to …** when all items share one) and confirm.
4. Reload Money Manager to see the change in its list. **Undo** / **Unsplit**
   reverses it.

Categories you pick are remembered per product (ASIN) and suggested next time.

## How it works

- **Amazon side** (`entrypoints/amazon.content.ts`, `lib/amazon/`): runs in an
  amazon.com tab, so requests are same-origin with your own session. If no
  Amazon tab is open, the background worker opens one in the background and
  closes it after 90s idle.
  - `/cpe/yourpayments/transactions` embeds the first 20 charges and an API
    token in `__NEXT_DATA__`; older ones come from
    `POST /payments-portal/data/iris/live/v1/data/manage/get-transactions`
    with `exclusiveStartKey` (what the page's infinite scroll calls).
  - Order details come from `/gp/css/summary/edit.html?orderID=…`, read via
    its `data-component` attributes.
  - Orders are cached in extension storage for 12h, charges for 10 min.
- **Money Manager side**: a MAIN-world script wraps fetch/XHR to reuse the
  widget's `md-session-token` and collect categories and Amazon transactions
  (as in `becu_import`). The panel runs in the ISOLATED world and talks to it
  over `window.postMessage`; Amazon data never enters the page's world.
- **Matching**: same amount, Amazon date 2 days after to 5 days before the card
  date, closest first. Charges paid with reward points or gift cards (no card
  number on Amazon) are ignored since they never reach the card.
- **Splitting**: the card charge is shared across items in proportion to
  price, which spreads tax, shipping and discounts the same way; cents are
  rounded so parts add up exactly. MX split = `PUT` the parent with
  `has_been_split: true`, then `POST` each part with `parent_guid`; undo is
  `DELETE /transactions/{guid}/unsplit` (captured from the widget). If a part
  fails, the split is undone.

## Limits / unverified

- Pending charges can't be split (the bank may replace them when they post).
- Refunds are matched and linked but not categorized by item yet.
- Several charges for one order, or orders partly paid with points: shares are
  proportional and flagged as an estimate.
- Unverified: that `x-amzn-upx-token` is the page's `__NEXT_DATA__` token;
  digital (`D01-`) order pages; that MX accepts `PUT` of the transaction object
  as listed (the widget adds a few display-only fields).
