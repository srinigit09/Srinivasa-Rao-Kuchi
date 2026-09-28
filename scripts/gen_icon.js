/**
 * Generate RentEase app icon.png + adaptive-icon.png
 * Design: Deep blue bg, modern MULTI-STOREY apartment block (not a house),
 *   coloured accent windows, bold "RentEase" text, key+rupee tag.
 * Run: node scripts/gen_icon.js
 */
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const SIZE = 1024;

function buildSVG({ rounded }) {
  const R = rounded ? 220 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs>
  <!-- Deep blue-to-indigo gradient background -->
  <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0%"   stop-color="#1E3A8A"/>
    <stop offset="55%"  stop-color="#1D4ED8"/>
    <stop offset="100%" stop-color="#2563EB"/>
  </linearGradient>
  <!-- Teal/cyan accent on windows -->
  <linearGradient id="winGlow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"  stop-color="#38BDF8"/>
    <stop offset="100%" stop-color="#0EA5E9"/>
  </linearGradient>
  <!-- Warm amber accent windows -->
  <linearGradient id="winAmber" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"  stop-color="#FCD34D"/>
    <stop offset="100%" stop-color="#F59E0B"/>
  </linearGradient>
  <!-- Green accent windows -->
  <linearGradient id="winGreen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"  stop-color="#34D399"/>
    <stop offset="100%" stop-color="#10B981"/>
  </linearGradient>
  <!-- Clip for rounded icon shape -->
  <clipPath id="iconClip">
    <rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}"/>
  </clipPath>
</defs>

<!-- ── Background ── -->
<rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

<!-- Subtle radial glow -->
<ellipse cx="512" cy="350" rx="480" ry="380" fill="#3B82F6" opacity="0.18"/>

<g clip-path="url(#iconClip)">

<!-- ════════════════════════════════════════════
     MULTI-STOREY BUILDING  (centred, 3 towers)
     ════════════════════════════════════════════ -->

<!-- ── TOWER LEFT (shorter, set back) ── -->
<rect x="115" y="390" width="185" height="370" rx="6" fill="white" opacity="0.92"/>
<!-- Floors dividers -->
<line x1="115" y1="465" x2="300" y2="465" stroke="#CBD5E1" stroke-width="2"/>
<line x1="115" y1="540" x2="300" y2="540" stroke="#CBD5E1" stroke-width="2"/>
<line x1="115" y1="615" x2="300" y2="615" stroke="#CBD5E1" stroke-width="2"/>
<line x1="115" y1="690" x2="300" y2="690" stroke="#CBD5E1" stroke-width="2"/>
<!-- Windows left tower — amber lit -->
<rect x="137" y="408" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<rect x="207" y="408" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<rect x="137" y="483" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<rect x="207" y="483" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<rect x="137" y="558" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<rect x="207" y="558" width="52" height="42" rx="5" fill="url(#winGreen)"/>
<rect x="137" y="633" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<rect x="207" y="633" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<!-- Roof detail left -->
<rect x="115" y="375" width="185" height="18" rx="3" fill="#93C5FD" opacity="0.6"/>
<!-- Water tank left -->
<rect x="178" y="340" width="58" height="38" rx="4" fill="white" opacity="0.5"/>
<rect x="190" y="326" width="4" height="16" fill="white" opacity="0.5"/>
<rect x="218" y="326" width="4" height="16" fill="white" opacity="0.5"/>

<!-- ── TOWER CENTRE (tallest, main) ── -->
<rect x="320" y="195" width="384" height="565" rx="8" fill="white"/>
<!-- Floors -->
<line x1="320" y1="285" x2="704" y2="285" stroke="#E2E8F0" stroke-width="2.5"/>
<line x1="320" y1="375" x2="704" y2="375" stroke="#E2E8F0" stroke-width="2.5"/>
<line x1="320" y1="465" x2="704" y2="465" stroke="#E2E8F0" stroke-width="2.5"/>
<line x1="320" y1="555" x2="704" y2="555" stroke="#E2E8F0" stroke-width="2.5"/>
<line x1="320" y1="645" x2="704" y2="645" stroke="#E2E8F0" stroke-width="2.5"/>
<!-- Column divider centre -->
<line x1="512" y1="195" x2="512" y2="760" stroke="#E2E8F0" stroke-width="2"/>

<!-- Windows centre — 2 cols × 6 rows — mixed colours -->
<!-- Floor 1 (top) -->
<rect x="345" y="210" width="145" height="60" rx="6" fill="url(#winGlow)"/>
<rect x="534" y="210" width="145" height="60" rx="6" fill="url(#winAmber)"/>
<!-- Floor 2 -->
<rect x="345" y="300" width="145" height="60" rx="6" fill="url(#winAmber)"/>
<rect x="534" y="300" width="145" height="60" rx="6" fill="url(#winGreen)"/>
<!-- Floor 3 -->
<rect x="345" y="390" width="145" height="60" rx="6" fill="url(#winGreen)"/>
<rect x="534" y="390" width="145" height="60" rx="6" fill="url(#winGlow)"/>
<!-- Floor 4 -->
<rect x="345" y="480" width="145" height="60" rx="6" fill="url(#winGlow)"/>
<rect x="534" y="480" width="145" height="60" rx="6" fill="url(#winAmber)"/>
<!-- Floor 5 -->
<rect x="345" y="570" width="145" height="60" rx="6" fill="url(#winAmber)"/>
<rect x="534" y="570" width="145" height="60" rx="6" fill="url(#winGreen)"/>

<!-- Main door (arched, centre) -->
<path d="M452,760 L452,680 Q452,650 512,650 Q572,650 572,680 L572,760 Z" fill="#1D4ED8"/>
<rect x="462" y="680" width="100" height="80" fill="#1E40AF"/>
<circle cx="556" cy="720" r="10" fill="#BFDBFE"/>

<!-- Roof terrace parapet -->
<rect x="320" y="180" width="384" height="18" rx="4" fill="#93C5FD" opacity="0.7"/>
<!-- Antenna / flag -->
<rect x="505" y="120" width="6" height="62" fill="white" opacity="0.7"/>
<ellipse cx="508" cy="118" rx="18" ry="10" fill="#F59E0B" opacity="0.9"/>
<!-- Water tanks top -->
<rect x="340" y="148" width="72" height="34" rx="5" fill="white" opacity="0.45"/>
<rect x="610" y="148" width="72" height="34" rx="5" fill="white" opacity="0.45"/>

<!-- ── TOWER RIGHT (medium) ── -->
<rect x="724" y="340" width="185" height="420" rx="6" fill="white" opacity="0.88"/>
<line x1="724" y1="415" x2="909" y2="415" stroke="#CBD5E1" stroke-width="2"/>
<line x1="724" y1="490" x2="909" y2="490" stroke="#CBD5E1" stroke-width="2"/>
<line x1="724" y1="565" x2="909" y2="565" stroke="#CBD5E1" stroke-width="2"/>
<line x1="724" y1="640" x2="909" y2="640" stroke="#CBD5E1" stroke-width="2"/>
<!-- Windows right tower -->
<rect x="746" y="358" width="52" height="42" rx="5" fill="url(#winGreen)"/>
<rect x="816" y="358" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<rect x="746" y="433" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<rect x="816" y="433" width="52" height="42" rx="5" fill="url(#winGreen)"/>
<rect x="746" y="508" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<rect x="816" y="508" width="52" height="42" rx="5" fill="url(#winAmber)"/>
<rect x="746" y="583" width="52" height="42" rx="5" fill="url(#winGreen)"/>
<rect x="816" y="583" width="52" height="42" rx="5" fill="url(#winGlow)"/>
<!-- Roof right -->
<rect x="724" y="325" width="185" height="18" rx="3" fill="#93C5FD" opacity="0.6"/>
<rect x="775" y="294" width="56" height="33" rx="4" fill="white" opacity="0.45"/>

<!-- ── Ground / road ── -->
<rect x="0" y="757" width="1024" height="18" rx="0" fill="#1E3A8A" opacity="0.6"/>

<!-- ════════════════════════════════════════════
     TEXT AREA  (below buildings)
     ════════════════════════════════════════════ -->

<!-- Frosted pill behind text -->
<rect x="120" y="790" width="784" height="160" rx="22" fill="white" opacity="0.10"/>

<!-- App name -->
<text
  x="512" y="875"
  font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
  font-size="108"
  font-weight="900"
  fill="white"
  text-anchor="middle"
  letter-spacing="2"
>RentEase</text>

<!-- Tagline -->
<text
  x="512" y="922"
  font-family="Arial,sans-serif"
  font-size="34"
  font-weight="600"
  fill="white"
  text-anchor="middle"
  opacity="0.70"
  letter-spacing="5"
>PROPERTY MANAGER</text>

<!-- Small key icon accent (left of tagline) -->
<text x="222" y="922" font-size="34" fill="white" opacity="0.55" font-family="Arial">🔑</text>
<!-- Rupee icon accent (right) -->
<text x="762" y="922" font-size="34" fill="white" opacity="0.55" font-family="Arial">₹</text>

</g>
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
