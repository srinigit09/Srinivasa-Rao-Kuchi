'use strict';

/**
 * Vendor PUBLIC keys used to verify Activation / Reset Codes.
 * Public keys can only verify codes, never create them, so it is safe to ship them in the app.
 *
 * HOW TO FILL THIS IN
 *   1. Open the Key Issuer app and complete "Create keys" (it makes 3 key pairs).
 *   2. Use "Export license-keys.js" in the Key Issuer and replace this file with the result.
 *   3. Rebuild the server installer once. Keys 2 and 3 are already inside, so later key
 *      changes need no new build.
 *
 * To retire a leaked key, set `retired: true` for it and ship a new server build.
 */

module.exports = [
  // { id: 1, publicKey: '<64 hex characters>', retired: false },
  // { id: 2, publicKey: '<64 hex characters>', retired: false },
  // { id: 3, publicKey: '<64 hex characters>', retired: false },
];
