import { defineConfig } from 'wxt';

export default defineConfig({
  // WXT defaults Firefox to MV2.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Amazon Orders for BECU Money Manager',
    description:
      'Split Amazon charges in BECU Money Manager by item using your order details. Unofficial; not affiliated with BECU, MX or Amazon.',
    homepage_url: 'https://github.com/zaquestion/becu-money-manager-amazon',
    permissions: ['storage'],
    host_permissions: ['https://www.amazon.com/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'becu-money-manager-amazon@zaquestion.github.io',
          // data_collection_permissions needs 140 (MAIN-world content scripts need 128).
          strict_min_version: '140.0',
          // Item names and amounts from Amazon orders are written to the
          // user's Money Manager transactions (MX).
          data_collection_permissions: { required: ['financialAndPaymentInfo'] },
        },
      },
    }),
  }),
  zip: {
    // Firefox's sources zip; these hold real captures with personal data.
    excludeSources: ['samples/**', 'mx_split', 'amz_transactions', 'store/**'],
  },
});
