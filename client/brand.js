'use strict';
/**
 * Company branding: About Us / Contact Us dialogs shared by the app menu and the tray.
 * Everything shown here is fixed text; the only things ever opened are the two fixed links below.
 */
const path = require('path');
const { dialog, shell, nativeImage } = require('electron');

const BRAND = Object.freeze({
  name     : 'Ciana Technologies',
  legal    : 'Ciana Tech Ltd',
  location : 'Melbourne',
  email    : 'info@cianatech.com.au',
  website  : 'https://cianatech.com.au/',
  copyright: 'Copyright 2026 by Ciana Tech Ltd.',
});

const ABOUT_TEXT =
  'Panic Alarm is a hospital emergency alert system.\n\n' +
  'Every room runs the Client, which keeps a Panic Alarm button on screen. Pressing it sends the alert to the ' +
  'Server, which instantly pops up a warning on every other registered station of the same hospital. Each ' +
  'station confirms that it displayed the alarm, and staff press OK to acknowledge it.\n\n' +
  'The Server keeps a log of every alarm (who sent it, from which room, who received and acknowledged it), ' +
  'shows it live on the dashboard, emails each alarm and lets the logs be downloaded or emailed.';

function markIcon() {
  try { return nativeImage.createFromPath(path.join(__dirname, 'assets', 'ciana-mark.png')); } catch { return undefined; }
}

function showAbout(parent) {
  return dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, {
    type: 'none', icon: markIcon(), title: `About Us - ${BRAND.name}`,
    message: BRAND.name, detail: `${ABOUT_TEXT}\n\n${BRAND.copyright}`,
    buttons: ['Close'], defaultId: 0, noLink: true,
  });
}

async function showContact(parent) {
  const r = await dialog.showMessageBox(parent && !parent.isDestroyed() ? parent : undefined, {
    type: 'none', icon: markIcon(), title: `Contact Us - ${BRAND.name}`,
    message: BRAND.name,
    detail: `Location: ${BRAND.location}\nEmail: ${BRAND.email}\nWebsite: ${BRAND.website}`,
    buttons: ['Visit Website', 'Send Email', 'Close'], defaultId: 2, cancelId: 2, noLink: true,
  });
  if (r.response === 0) shell.openExternal(BRAND.website);
  else if (r.response === 1) shell.openExternal(`mailto:${BRAND.email}`);
}

module.exports = { BRAND, showAbout, showContact };
