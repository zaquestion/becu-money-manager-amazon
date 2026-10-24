# Store listings

Copy-paste text for the Chrome Web Store Developer Dashboard and, where noted under
[Firefox Add-ons (AMO)](#firefox-add-ons-amo), the AMO Developer Hub. Chrome: Upload `.output/becu-money-manager-amazon-<version>-chrome.zip`
(built with `pnpm zip`). Store icon: `store/icon-128.png`. Screenshots (1280×800):
`store/screenshot-1-toolbar.png`, `store/screenshot-2-panel.png`, `store/screenshot-3-drawer.png`,
`store/screenshot-4-items.png` (order numbers, statement codes and other charges blurred).
Icons come from `scripts/make-icons.py`. Extension ID: `fcekbhgbigdcbkjnahehajmdgnnljijj`
(https://chromewebstore.google.com/detail/fcekbhgbigdcbkjnahehajmdgnnljijj).

## Name

Amazon Orders for BECU Money Manager

## Summary (manifest description, max 132 chars)

Split Amazon charges in BECU Money Manager by item using your order details. Unofficial; not affiliated with BECU, MX or Amazon.

## Category

Tools (or Productivity › Tools)

## Detailed description

See what you actually bought behind each Amazon charge in BECU Money Manager, and categorize it by item. A $60 Amazon charge can be dog food, a phone cable and a book; this extension splits it into one transaction per item, each in its own category.

Click "Amazon items" on Money Manager's Transactions tab, or "Update With Item Details" in a transaction's details. Each Amazon charge is matched to your Amazon payments and shows the order's items. Pick a category per item and confirm.

Features
• Matches Money Manager charges to your Amazon payments by amount and date, and shows each order's items and prices
• Splits a multi-item charge into one part per item, sharing tax, shipping and discounts in proportion to price so the parts add up exactly
• Recategorizes single-item charges instead of splitting them
• Puts the item name in the payee ("Amazon - <item>") and the full item names in the memo (both optional)
• Remembers the category you pick for each product and suggests it next time
• Undo and Unsplit put a transaction back the way it was
• Warns about pending charges, which the bank may replace when they post, and flags estimates when an order was charged in parts or partly paid with points or a gift card

You need to be signed in to amazon.com in the same browser. If no Amazon tab is open, the extension opens one in the background to read your orders, and closes it again after a minute and a half.

Works elsewhere too
BECU Money Manager is built on MX's Money Manager widget (widgets.moneydesktop.com). This extension talks to that widget the same way its own buttons do, so it may also work with Money Manager at other banks and credit unions that use MX. Only BECU has been tested, and only amazon.com (US) orders.

Privacy
The extension reads your Amazon payments and order details from amazon.com using your own signed-in session, and changes categories, payees, memos and splits in Money Manager through Money Manager's own API. Nothing is collected, tracked, or sent to the developer or anyone else. Your Amazon data and settings stay in your browser.

Open source: https://github.com/zaquestion/becu-money-manager-amazon

This is an independent project. It is not made, endorsed, or supported by BECU, MX Technologies or Amazon.

## Single purpose (Privacy practices tab)

Shows the Amazon order items behind Amazon charges in BECU Money Manager (MX Money Manager), and splits or recategorizes those charges by item.

## Permission justifications

**storage:** Saves the user's settings in the browser: the category picked for each Amazon product, which transactions the extension changed (so they can be undone), the payee and memo options, and a cache of the Amazon payments and order details already read, so each order is only fetched once.

**Host permission (www.amazon.com):** Reads the user's Amazon payments (Your Payments › Transactions) and order details pages to find which order each card charge belongs to and what items it contained. A content script on amazon.com makes these requests same-origin with the user's existing Amazon session. If no Amazon tab is open, the extension opens one in the background for this and closes it after 90 seconds idle. Nothing on amazon.com is changed.

**Content scripts on widgets.moneydesktop.com:** Money Manager is hosted there. The scripts add the "Amazon items" button and panel and the "Update With Item Details" section, and read the Amazon transactions and categories the page already loads. When the user confirms, they recategorize or split that transaction (and set its payee and memo) through Money Manager's own API, using the session the page already has. The Amazon data stays in the extension's isolated script and is never added to the page's own scripts.

## Remote code

No, I am not using remote code. All code is bundled in the package.

## Data usage disclosures

Tick: **Financial and payment information** (Money Manager transactions and Amazon payments: amounts, dates, statement descriptions, the payment card's name and last 4 digits, order numbers, and item names and prices) and **Authentication information** (the extension reuses the page's Money Manager session token to make the same requests the page makes when editing or splitting a transaction, and the user's existing amazon.com session to read their orders).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Writing the item categories, names and split amounts back to the user's own Money Manager transaction is the item's single purpose, done only when the user confirms a split or category change.

## Firefox Add-ons (AMO)

Upload `.output/becu-money-manager-amazon-<version>-firefox.zip`, then
`.output/becu-money-manager-amazon-<version>-sources.zip` when asked for source code (both from
`pnpm zip:firefox`). Add-on ID: `becu-money-manager-amazon@zaquestion.github.io`
(https://addons.mozilla.org/firefox/addon/becu-money-manager-amazon/). Requires Firefox 140+.
Reuse the name, the detailed description, the icon and the screenshots from above; AMO shows
screenshots at any size, so the 1280×800 ones work as they are.

**Summary (max 250 chars):** Split Amazon charges in BECU Money Manager by item using your Amazon
order details: see the items behind each charge, pick a category per item, and split or
recategorize it. Unofficial; not affiliated with BECU, MX or Amazon.

**Categories:** Shopping; Other

**Tags:** amazon, budget, finance, money manager, bank

**Support site:** https://github.com/zaquestion/becu-money-manager-amazon/issues

**Homepage:** https://github.com/zaquestion/becu-money-manager-amazon

**License:** pick one in the form (the repo has no LICENSE file yet).

**Privacy policy:** paste the [Privacy](#privacy) section below.

**Data collection (from the manifest):** Financial and payment information, required. Item names
and amounts from the user's Amazon orders are written to their own Money Manager transactions when
they confirm a split or category change. Nothing is sent to the developer.

**Notes to reviewer:**

> Built with WXT (Vite). To reproduce the uploaded zip from the sources zip: Node 22 and pnpm
> 12.15.0 (pinned in package.json `packageManager`; `corepack enable` selects it), then
> `pnpm install --frozen-lockfile && pnpm zip:firefox`. The build is in `.output/firefox-mv3/`
> and the zip in `.output/`. No remote code; everything is bundled.
>
> Testing needs a BECU online banking account (Money Manager runs at widgets.moneydesktop.com
> inside it) and an amazon.com account with recent orders, so it can't be tried without one.
> What it does: the amazon.com content script fetches the user's own Your Payments and order
> details pages (same-origin, read-only) when Money Manager asks for them, through the background
> script, which opens a background amazon.com tab if none is open and closes it after 90s idle.
> The MAIN-world script on widgets.moneydesktop.com wraps fetch/XHR to reuse the widget's session
> headers and read the transactions and categories it loads; it only sends the widget's own API
> requests (recategorize, split, unsplit) after the user confirms in the extension's UI. Amazon
> data stays in the isolated-world script and is never handed to the page.

## Privacy policy URL

https://github.com/zaquestion/becu-money-manager-amazon/blob/main/store/listing.md#privacy

## Privacy

Amazon Orders for BECU Money Manager does not collect, sell, or share any personal data, and the developer receives no data. It runs only on widgets.moneydesktop.com and www.amazon.com. On amazon.com, it reads your Amazon payments (dates, amounts, statement descriptions, the payment card's name and last 4 digits, order numbers) and the details of the matching orders (item names, product IDs and prices), using your existing signed-in session; it changes nothing on Amazon. On widgets.moneydesktop.com, it reads the Amazon transactions and categories Money Manager loads, and when you confirm, it changes that transaction's category, payee and memo or splits it by item through Money Manager, using your existing signed-in session. The item names you choose to write (in the payee and memo) are then stored by Money Manager like any other edit you make there. Order details are cached in your browser's extension storage for 14 days and then deleted, and payments for the browser session; your settings (the category for each product, which transactions the extension changed, the payee and memo options) are kept in extension storage too. None of it leaves your device except as described above. Questions: open an issue at https://github.com/zaquestion/becu-money-manager-amazon/issues
