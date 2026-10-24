# Amazon Orders for BECU Money Manager

Chrome and Firefox extension (TypeScript + [WXT](https://wxt.dev)) that shows
the items behind each Amazon charge in BECU Money Manager (MX's widget at
`widgets.moneydesktop.com`), and splits or recategorizes the charge by item.
Companion to `becu_import`.

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/fcekbhgbigdcbkjnahehajmdgnnljijj)
or [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/becu-money-manager-amazon/).

Unofficial; not affiliated with BECU, MX or Amazon.

## Build & load

Needs Node and [pnpm](https://pnpm.io) (the version is pinned in
`package.json`'s `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
pnpm build          # or `pnpm dev` for live reload
pnpm test
```

Tests that read saved Amazon/MX pages skip unless those pages are in
`samples/` (git-ignored, since real pages contain personal data).

Open `chrome://extensions`, enable Developer mode, click **Load unpacked** and
pick `.output/chrome-mv3`.

For Firefox (140 or later), use `pnpm build:firefox` (or `pnpm dev:firefox`),
then open `about:debugging#/runtime/this-firefox`, click **Load Temporary
Add-on…** and pick `.output/firefox-mv3/manifest.json`.

## Release

Publish a GitHub release with a tag like `v0.2.0`. The `Release` workflow sets
the extension version from the tag, runs the type check and tests, attaches the
Chrome, Firefox and sources zips to the release and submits them to the Chrome
Web Store and Firefox Add-ons (AMO), where they go live after review. The
version must be higher than the one currently in each store.

### Chrome Web Store

The workflow uses the Chrome Web Store API v2 with a service account. One-time
setup:

1. In Google Cloud, enable the Chrome Web Store API, create a service account
   (no roles needed) and create a JSON key for it.
2. In the Chrome Web Store Developer Dashboard, add the service account's email
   under **Account**.
3. Add these repository secrets (the extension and publisher IDs are set in
   the workflow):
   - `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` (`client_email` from the key)
   - `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (`private_key` from the key, pasted as
     the multi-line PEM, not with literal `\n`)

### Firefox Add-ons

AMO reviews the built code against the sources zip (`pnpm zip:firefox` writes
both; `samples/`, `store/` and the raw captures are left out). The add-on ID
`becu-money-manager-amazon@zaquestion.github.io` is set in `wxt.config.ts`.
One-time setup:

1. Submit the first version by hand at
   <https://addons.mozilla.org/developers/addon/submit/> (the API can only add
   versions to an existing add-on): upload the Firefox zip, then the sources
   zip, and fill in the listing from `store/listing.md`.
2. Create API credentials at
   <https://addons.mozilla.org/developers/addon/api/key/> and add them as
   repository secrets `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`.

## Use

1. Be signed in to amazon.com in the same browser profile.
2. In Money Manager, open Transactions and click **Amazon items** (next to
   Export CSV), or open an Amazon charge and click **Update With Item
   Details** in its Transaction Details drawer.
3. Each Amazon charge in view is matched to your Amazon payments and shows the
   order's items. Pick a category per item, then **Split into N items** (or
   **Set category to …** for a single-item order) and confirm. Multi-item
   charges get one part per item, even when items share a category.
4. Reload Money Manager to see the change in its list. **Undo** / **Unsplit**
   reverses it.

Categories you pick are remembered per product (ASIN) and suggested next time.
With **Item in payee** on, single-item charges and split parts get the payee
`Amazon - <item>`; with **Item names in memo** on, full item names go in the
memo. Both are on by default.

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
  - Orders are cached in extension storage for 14 days (then deleted), charges
    for 10 min. Orders aren't fetched for charges already split or
    recategorized.
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

## License

[AGPL-3.0-or-later](LICENSE). Copyright 2026 Zaq Question.
