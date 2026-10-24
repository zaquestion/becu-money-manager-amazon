import { defineContentScript } from '#imports';
import { mountPanel } from '@/lib/panel';

// The UI half, in the ISOLATED world so it can talk to the extension. The
// MAIN world half (moneydesktop-main.content.ts) holds the MX session.
export default defineContentScript({
  matches: ['https://widgets.moneydesktop.com/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    if (!location.pathname.startsWith('/md/')) return;
    mountPanel();
  },
});
