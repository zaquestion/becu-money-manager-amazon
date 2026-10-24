import { browser, defineContentScript } from '#imports';
import { SignedOutError, fetchCharges, fetchOrder } from '@/lib/amazon/client';
import type { AmazonRequest, AmazonResult } from '@/lib/messages';
import { AMAZON_READY } from '@/lib/messages';

// Does the Amazon side of the work: the background worker forwards requests
// here so they run as same-origin requests in an amazon.com page.
export default defineContentScript({
  matches: ['https://www.amazon.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: AmazonRequest, _sender, reply) => {
      const run =
        message.type === 'amazon:charges'
          ? () => fetchCharges(message.since)
          : message.type === 'amazon:order'
            ? () => fetchOrder(message.id)
            : undefined;
      if (!run) return false;
      run().then(
        (value) => reply({ ok: true, value } satisfies AmazonResult<unknown>),
        (err: Error) =>
          reply({ ok: false, error: err.message, signedOut: err instanceof SignedOutError } satisfies AmazonResult<unknown>),
      );
      return true; // reply asynchronously
    });
    browser.runtime.sendMessage({ type: AMAZON_READY }).catch(() => {});
  },
});
