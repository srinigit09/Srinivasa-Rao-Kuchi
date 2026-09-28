/**
 * RentEase icon v4 — clean minimalist design
 * Background: deep blue gradient
 * Foreground: light semi-transparent building silhouette (outline style)
 * Centre: "RentEase" app name bold white text in the middle
 * Run: node scripts/gen_icon.js
 */
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const SIZE  = 1024;

function buildSVG({ rounded }) {
  const R = rounded ? 220 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0%"   stop-color="#0F1F6E"/>
    <stop offset="50%"  stop-color="#1E3A8A"/>
    <stop offset="100%" stop-color="#1D4ED8"/>
  </linearGradient>
  <clipPath id="clip"><rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}"/></clipPath>
</defs>

<!-- Background -->
<rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

<g clip-path="url(#clip)" opacity="0.18">

  <!-- ═══════════════════════════════════════
       BUILDING SILHOUETTE — outline only,
       very light so it reads as background
       ═══════════════════════════════════════ -->

  <!-- Main building body (tall centre tower) -->
  <rect x="262" y="180" width="500" height="680" rx="6"
        fill="none" stroke="white" stroke-width="10"/>

  <!-- Left wing (shorter) -->
  <rect x="100" y="320" width="162" height="540" rx="6"
        fill="none" stroke="white" stroke-width="8"/>

  <!-- Right wing (shorter) -->
  <rect x="762" y="320" width="162" height="540" rx="6"
        fill="none" stroke="white" stroke-width="8"/>

  <!-- Rooftop parapet - centre -->
  <rect x="262" y="158" width="500" height="24" rx="4"
        fill="white"/>

  <!-- Rooftop parapet - left wing -->
  <rect x="100" y="302" width="162" height="18" rx="4"
        fill="white"/>

  <!-- Rooftop parapet - right wing -->
  <rect x="762" y="302" width="162" height="18" rx="4"
        fill="white"/>

  <!-- Centre tower windows — 5 columns × 6 rows -->
  <!-- col x positions: 292, 368, 450, 532, 614, 694 -->
  <!-- row y positions: 218, 310, 402, 494, 586, 678 -->
  ${[292,368,450,532,614,694].map(x =>
    [218,310,402,494,586,678].map(y =>
      `<rect x="${x}" y="${y}" width="52" height="66" rx="5" fill="white"/>`
    ).join('\n  ')
  ).join('\n  ')}

  <!-- Left wing windows — 2 cols × 4 rows -->
  ${[118, 168].map(x =>
    [356, 440, 524, 608].map(y =>
      `<rect x="${x}" y="${y}" width="42" height="54" rx="4" fill="white"/>`
    ).join('\n  ')
  ).join('\n  ')}

  <!-- Right wing windows — 2 cols × 4 rows -->
  ${[776, 826].map(x =>
    [356, 440, 524, 608].map(y =>
      `<rect x="${x}" y="${y}" width="42" height="54" rx="4" fill="white"/>`
    ).join('\n  ')
  ).join('\n  ')}

  <!-- Entrance door (centre bottom of main tower) -->
  <rect x="462" y="736" width="100" height="124" rx="6"
        fill="none" stroke="white" stroke-width="8"/>
  <!-- Door centre line -->
  <line x1="512" y1="736" x2="512" y2="860"
        stroke="white" stroke-width="5"/>

  <!-- Ground line -->
  <line x1="60" y1="862" x2="964" y2="862"
        stroke="white" stroke-width="8"/>

</g>

<!-- ═══════════════════════════════════════════════════
     APP NAME — "RentEase" centred in the icon
     Large, bold, white — clearly readable over the faint building
     ═══════════════════════════════════════════════════ -->

<!-- Subtle pill shadow so text pops over building lines -->
<rect x="172" y="430" width="680" height="164" rx="24"
      fill="#1D4ED8" opacity="0.55"/>

<!-- "Rent" -->
<text
  x="512" y="512"
  font-family="'Arial Black','Impact','Helvetica Neue',Arial,sans-serif"
  font-size="112"
  font-weight="900"
  fill="white"
  text-anchor="middle"
  letter-spacing="-2"
>Rent</text>

<!-- "Ease" — slightly smaller, accent blue-white -->
<text
  x="512" y="584"
  font-family="'Arial Black','Impact','Helvetica Neue',Arial,sans-serif"
  font-size="72"
  font-weight="900"
  fill="#BAE6FD"
  text-anchor="middle"
  letter-spacing="8"
>EASE</text>

</svg>`;
}

async function generate() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  console.log('Generating icon.png …');
  await sharp(Buffer.from(buildSVG({ rounded: true })))
    .resize(SIZE, SIZE).png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('✓ assets/icon.png');

  console.log('Generating adaptive-icon.png …');
  await sharp(Buffer.from(buildSVG({ rounded: false })))
    .resize(SIZE, SIZE).png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('✓ assets/adaptive-icon.png');

  console.log('Done.');
}

generate().catch(e => { console.error(e); process.exit(1); });
