import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Amazon Orders for BECU Money Manager',
    description:
      'Split and categorize Amazon charges in BECU Money Manager using your Amazon order details. Unofficial; not affiliated with BECU, MX or Amazon.',
    permissions: ['storage'],
    host_permissions: ['https://www.amazon.com/*'],
  },
});
