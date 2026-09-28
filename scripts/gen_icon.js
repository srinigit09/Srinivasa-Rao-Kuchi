/**
 * Generate RentEase app icon.png (1024×1024) and adaptive-icon.png (1024×1024)
 * Design: deep-blue gradient background, white house silhouette, "RentEase" bold text
 * Run: node scripts/gen_icon.js
 */
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SIZE = 1024;

/* ── SVG template ─────────────────────────────────────────────────────────── */
function buildSVG({ rounded }) {
  const R = rounded ? SIZE / 6 : 0;   // corner radius
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1D4ED8"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
    <clipPath id="shape">
      <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

  <!-- Subtle radial glow top-left -->
  <radialGradient id="glow" cx="30%" cy="25%" r="55%">
    <stop offset="0%"   stop-color="#3B82F6" stop-opacity="0.45"/>
    <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0"/>
  </radialGradient>
  <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#glow)" clip-path="url(#shape)"/>

  <!-- ── House group ── -->
  <g clip-path="url(#shape)">

    <!-- Drop shadow for house (soft, behind) -->
    <g opacity="0.22">
      <polygon points="512,195 155,462 869,462" fill="#000"/>
      <rect x="215" y="456" width="594" height="290" fill="#000"/>
    </g>

    <!-- Roof -->
    <polygon points="512,178 148,458 876,458" fill="white"/>

    <!-- Chimney -->
    <rect x="650" y="218" width="58" height="110" rx="6" fill="white"/>
    <!-- Chimney smoke puff (decorative circles) -->
    <circle cx="679" cy="198" r="18" fill="white" opacity="0.6"/>
    <circle cx="695" cy="178" r="13" fill="white" opacity="0.35"/>

    <!-- House body -->
    <rect x="215" y="450" width="594" height="296" rx="0" fill="white"/>

    <!-- Left window -->
    <rect x="265" y="510" width="130" height="120" rx="8" fill="#BFDBFE"/>
    <line x1="330" y1="510" x2="330" y2="630" stroke="#1D4ED8" stroke-width="6"/>
    <line x1="265" y1="570" x2="395" y2="570" stroke="#1D4ED8" stroke-width="6"/>

    <!-- Right window -->
    <rect x="609" y="510" width="130" height="120" rx="8" fill="#BFDBFE"/>
    <line x1="674" y1="510" x2="674" y2="630" stroke="#1D4ED8" stroke-width="6"/>
    <line x1="609" y1="570" x2="739" y2="570" stroke="#1D4ED8" stroke-width="6"/>

    <!-- Door arch -->
    <path d="M450,746 L450,596 Q450,556 512,556 Q574,556 574,596 L574,746 Z" fill="#1D4ED8"/>
    <!-- Door inner highlight -->
    <path d="M462,742 L462,601 Q462,570 512,570 Q562,570 562,601 L562,742 Z" fill="#1E40AF"/>
    <!-- Door knob -->
    <circle cx="554" cy="660" r="12" fill="#BFDBFE"/>

    <!-- Roof ridge line -->
    <line x1="148" y1="458" x2="876" y2="458" stroke="#E5E7EB" stroke-width="4" opacity="0.4"/>

  </g>

  <!-- ── "RentEase" Text ── -->
  <!-- Subtle pill background for text -->
  <rect x="148" y="772" width="728" height="108" rx="16" fill="white" opacity="0.12"/>
  <text
    x="512" y="850"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="90"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    letter-spacing="4"
  >RentEase</text>

  <!-- Small tagline -->
  <text
    x="512" y="890"
    font-family="Arial, sans-serif"
    font-size="32"
    font-weight="400"
    fill="white"
    text-anchor="middle"
    opacity="0.65"
    letter-spacing="3"
  >PROPERTY MANAGER</text>

</svg>`;
}

async function generate() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  // icon.png — rounded corners (used by iOS + general)
  const svgIcon = Buffer.from(buildSVG({ rounded: true }));
  await sharp(svgIcon)
    .resize(SIZE, SIZE)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('✓ assets/icon.png');

  // adaptive-icon.png — no rounded corners (Android clips it to a circle/squircle itself)
  const svgAdaptive = Buffer.from(buildSVG({ rounded: false }));
  await sharp(svgAdaptive)
    .resize(SIZE, SIZE)
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('✓ assets/adaptive-icon.png');

  console.log('Icons generated successfully.');
}

generate().catch(e => { console.error(e); process.exit(1); });
