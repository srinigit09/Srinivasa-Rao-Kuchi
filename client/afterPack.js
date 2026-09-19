'use strict';
/**
 * afterPack hook — called by electron-builder after packaging, before DMG/EXE creation.
 * Writes a unique install-id into the app's resources/ folder so the runtime can
 * detect a fresh installation vs a reopen (userData is NOT wiped on reinstall,
 * but resources/ IS replaced every time the app is installed).
 */
const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

module.exports = async function afterPack({ appOutDir, packager }) {
  const resourcesDir = path.join(appOutDir,
    packager.platform.name === 'mac' ? 'PanicAlarmClient.app/Contents/Resources' : 'resources'
  );

  const installId = randomUUID();
  fs.writeFileSync(path.join(resourcesDir, 'install-id'), installId, 'utf8');
  console.log(`[afterPack] Stamped install-id: ${installId} → ${resourcesDir}`);
};
