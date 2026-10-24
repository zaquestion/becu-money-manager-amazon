import { defineContentScript } from '#imports';
import { serveBridge } from '@/lib/bridge';
import { recategorize, split, unsplit } from '@/lib/mx/api';
import { categories, hasSession, installHooks, onSessionChange, transactions } from '@/lib/mx/session';

export default defineContentScript({
  matches: ['https://widgets.moneydesktop.com/*'],
  allFrames: true,
  runAt: 'document_start',
  // MAIN world so our fetch/XHR wrappers see the widget's own requests.
  world: 'MAIN',
  main() {
    installHooks();
    if (!location.pathname.startsWith('/md/')) return;
    const send = serveBridge(
      () => ({ hasSession: hasSession(), categories: [...categories.values()], transactions: [...transactions.values()] }),
      (call) => {
        switch (call.op) {
          case 'recategorize':
            return recategorize(call.guid, call.changes);
          case 'split':
            return split(call.guid, call.parts);
          case 'unsplit':
            return unsplit(call.guid);
        }
      },
    );
    // Data trickles in as the widget loads; batch the updates.
    let timer = 0;
    onSessionChange(() => {
      clearTimeout(timer);
      timer = window.setTimeout(send, 200);
    });
  },
});
