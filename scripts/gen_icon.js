/**
 * RentEase icon v3 — single modern apartment building
 * Design: deep blue gradient bg, one clean white building with two wings,
 *   "RentEase" label centred in the entrance gap between wings,
 *   subtle coloured windows, no multi-colour clutter.
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
  <linearGradient id="bg" x1="0" y1="0" x2="0.2" y2="1">
    <stop offset="0%"   stop-color="#172554"/>
    <stop offset="40%"  stop-color="#1E3A8A"/>
    <stop offset="100%" stop-color="#1D4ED8"/>
  </linearGradient>
  <!-- Window glow — soft cyan -->
  <linearGradient id="win" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"  stop-color="#BAE6FD"/>
    <stop offset="100%" stop-color="#7DD3FC"/>
  </linearGradient>
  <!-- Lit window (warm) -->
  <linearGradient id="winW" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"  stop-color="#FDE68A"/>
    <stop offset="100%" stop-color="#FCD34D"/>
  </linearGradient>
  <clipPath id="clip"><rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}"/></clipPath>
</defs>

<!-- Background -->
<rect width="${SIZE}" height="${SIZE}" rx="${R}" ry="${R}" fill="url(#bg)"/>

<!-- Very subtle ambient glow -->
<ellipse cx="512" cy="460" rx="440" ry="320" fill="#2563EB" opacity="0.15"/>

<g clip-path="url(#clip)">

<!-- ══════════════════════════════════════════
     SINGLE APARTMENT BUILDING — two wings
     with entrance gap in the middle
     ══════════════════════════════════════════ -->

<!-- ─── LEFT WING ─────────────────────────── -->
<!-- Body -->
<rect x="96" y="210" width="368" height="556" rx="6" fill="white"/>
<!-- Floor lines -->
<line x1="96"  y1="300" x2="464" y2="300" stroke="#E2E8F0" stroke-width="2"/>
<line x1="96"  y1="390" x2="464" y2="390" stroke="#E2E8F0" stroke-width="2"/>
<line x1="96"  y1="480" x2="464" y2="480" stroke="#E2E8F0" stroke-width="2"/>
<line x1="96"  y1="570" x2="464" y2="570" stroke="#E2E8F0" stroke-width="2"/>
<line x1="96"  y1="660" x2="464" y2="660" stroke="#E2E8F0" stroke-width="2"/>
<!-- Windows — floor 1 (top) -->
<rect x="120" y="228" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="210" y="228" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="300" y="228" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="390" y="228" width="60" height="56" rx="5" fill="url(#winW)"/>
<!-- Floor 2 -->
<rect x="120" y="316" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="210" y="316" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="300" y="316" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="390" y="316" width="60" height="56" rx="5" fill="url(#win)"/>
<!-- Floor 3 -->
<rect x="120" y="406" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="210" y="406" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="300" y="406" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="390" y="406" width="60" height="56" rx="5" fill="url(#winW)"/>
<!-- Floor 4 -->
<rect x="120" y="496" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="210" y="496" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="300" y="496" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="390" y="496" width="60" height="56" rx="5" fill="url(#win)"/>
<!-- Floor 5 -->
<rect x="120" y="586" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="210" y="586" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="300" y="586" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="390" y="586" width="60" height="56" rx="5" fill="url(#winW)"/>
<!-- Roof parapet -->
<rect x="96"  y="196" width="368" height="16" rx="4" fill="#BFDBFE" opacity="0.8"/>
<!-- Rooftop details -->
<rect x="140" y="158" width="70" height="40" rx="4" fill="white" opacity="0.5"/>
<rect x="350" y="166" width="50" height="32" rx="4" fill="white" opacity="0.45"/>

<!-- ─── RIGHT WING ────────────────────────── -->
<rect x="560" y="210" width="368" height="556" rx="6" fill="white"/>
<line x1="560" y1="300" x2="928" y2="300" stroke="#E2E8F0" stroke-width="2"/>
<line x1="560" y1="390" x2="928" y2="390" stroke="#E2E8F0" stroke-width="2"/>
<line x1="560" y1="480" x2="928" y2="480" stroke="#E2E8F0" stroke-width="2"/>
<line x1="560" y1="570" x2="928" y2="570" stroke="#E2E8F0" stroke-width="2"/>
<line x1="560" y1="660" x2="928" y2="660" stroke="#E2E8F0" stroke-width="2"/>
<!-- Windows right wing — mirrored colour pattern -->
<rect x="574" y="228" width="60" height="56" rx="5" fill="url(#winW)"/>
<rect x="652" y="228" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="742" y="228" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="832" y="228" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="574" y="316" width="60" height="56" rx="5" fill="url(#win)"/>
<rect x="652" y="316" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="742" y="316" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="832" y="316" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="574" y="406" width="60" height="56" rx="5" fill="url(#winW)"/>
<rect x="652" y="406" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="742" y="406" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="832" y="406" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="574" y="496" width="60" height="56" rx="5" fill="url(#win)"/>
<rect x="652" y="496" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="742" y="496" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="832" y="496" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="574" y="586" width="60" height="56" rx="5" fill="url(#winW)"/>
<rect x="652" y="586" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="742" y="586" width="72" height="56" rx="5" fill="url(#winW)"/>
<rect x="832" y="586" width="72" height="56" rx="5" fill="url(#win)"/>
<rect x="560" y="196" width="368" height="16" rx="4" fill="#BFDBFE" opacity="0.8"/>
<rect x="564" y="158" width="50" height="32" rx="4" fill="white" opacity="0.45"/>
<rect x="814" y="166" width="70" height="40" rx="4" fill="white" opacity="0.5"/>

<!-- ─── ENTRANCE / LOBBY (centre gap) ──────── -->
<!-- Canopy over entrance -->
<rect x="430" y="618" width="164" height="18" rx="4" fill="#93C5FD" opacity="0.85"/>
<!-- Lobby glass doors (2) -->
<rect x="452" y="636" width="50" height="130" rx="4" fill="#BFDBFE" opacity="0.6"/>
<rect x="522" y="636" width="50" height="130" rx="4" fill="#BFDBFE" opacity="0.6"/>
<!-- Door handles -->
<rect x="497" y="696" width="6" height="20" rx="3" fill="#1D4ED8" opacity="0.7"/>
<rect x="521" y="696" width="6" height="20" rx="3" fill="#1D4ED8" opacity="0.7"/>
<!-- Steps -->
<rect x="420" y="762" width="184" height="10" rx="2" fill="white" opacity="0.35"/>
<rect x="410" y="772" width="204" height="8"  rx="2" fill="white" opacity="0.25"/>

<!-- Ground shadow line -->
<rect x="0" y="764" width="1024" height="12" fill="#172554" opacity="0.4"/>

<!-- ══════════════════════════════════════════
     "RentEase" LABEL — centred in entrance gap
     between the two wings, mid-building height
     ══════════════════════════════════════════ -->

<!-- Pill backing for the label (sits in entrance gap) -->
<rect x="418" y="500" width="188" height="76" rx="14" fill="#1D4ED8"/>
<rect x="422" y="504" width="180" height="68" rx="11" fill="#2563EB" opacity="0.6"/>

<!-- "Rent" top line -->
<text
  x="512" y="541"
  font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
  font-size="36"
  font-weight="900"
  fill="white"
  text-anchor="middle"
  letter-spacing="3"
>Rent</text>
<!-- "Ease" bottom line, slightly larger -->
<text
  x="512" y="572"
  font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
  font-size="28"
  font-weight="900"
  fill="#BAE6FD"
  text-anchor="middle"
  letter-spacing="4"
>Ease</text>

<!-- Small key icon below label -->
<text x="474" y="605" font-family="Arial" font-size="22" fill="white" opacity="0.55">🔑</text>
<text x="528" y="605" font-family="Arial" font-size="22" fill="#FDE68A" opacity="0.7">₹</text>

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
