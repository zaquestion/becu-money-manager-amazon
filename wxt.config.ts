import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Amazon Orders for BECU Money Manager',
    description:
      'Split Amazon charges in BECU Money Manager by item using your order details. Unofficial; not affiliated with BECU, MX or Amazon.',
    homepage_url: 'https://github.com/zaquestion/becu-money-manager-amazon',
    permissions: ['storage'],
    host_permissions: ['https://www.amazon.com/*'],
  },
});
