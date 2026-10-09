// Regenerates the original placeholder artwork in site/img/demo (no real people, no third-party art).
// Run: npm i --no-save sharp && node tools/generate-demo-art.cjs
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "site", "img");
const GOLD = "#d8bb8a", GOLD2 = "#b8925a", INK = "#14110e", IVORY = "#f6f2eb";

async function render(svg, file, width) {
  const p = path.join(OUT, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await sharp(Buffer.from(svg)).resize({ width }).webp({ quality: 82 }).toFile(p);
  console.log(file, fs.statSync(p).size);
}

/* ---------------------------------------------------------- smiles */
const smile = require(path.join(__dirname, "smile.cjs"));

const SMILES = [
  { skin: ["#efcfb6", "#cf9a78"], lip: ["#c7727a", "#a1525a"], issues: { stain: 1, gap: 26 } },
  { skin: ["#c99572", "#8e5b3e"], lip: ["#a85a5a", "#7e3b3e"], issues: { crowd: 1, stain: 1 } },
  { skin: ["#f2d6c2", "#d9a98a"], lip: ["#d08088", "#a85c66"], issues: { chip: 1, uneven: 1 } },
  { skin: ["#8a5a3c", "#5c3a26"], lip: ["#8c4a4a", "#653233"], issues: { dark: 1, stain: 1, uneven: 1 } },
  { skin: ["#e6bf9c", "#b98262"], lip: ["#bd6a6a", "#93484c"], issues: { gap: 18, crowd: 1 } },
  { skin: ["#f4dccb", "#dcae90"], lip: ["#cf7d86", "#ab5964"], issues: { stain: 1, chip: 1 } },
];

/* ---------------------------------------------------------- avatars */
function avatar(seed) {
  const tones = [["#e8c3a4", "#c48f6d"], ["#c48e6a", "#8f5c40"], ["#8d5d40", "#5e3c29"], ["#f1d3bd", "#d4a283"], ["#a8714f", "#74482f"]];
  const hairs = ["#2a1d16", "#4a3226", "#111", "#7a5536", "#c9a36a", "#3b2a20"];
  const bgs = [["#2b241d", "#3d3329"], ["#33291f", "#1f1a15"], ["#3a3127", "#26201a"]];
  const t = tones[seed % tones.length], h = hairs[(seed * 7) % hairs.length], b = bgs[seed % bgs.length];
  const long = seed % 2 === 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b[0]}"/><stop offset="1" stop-color="${b[1]}"/></linearGradient>
  <radialGradient id="s" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="${t[0]}"/><stop offset="1" stop-color="${t[1]}"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#b)"/>
  ${long ? `<path d="M52 92 Q48 40 100 36 Q152 40 148 92 L156 170 L44 170 Z" fill="${h}"/>` : ""}
  <path d="M30 210 Q34 150 100 146 Q166 150 170 210 Z" fill="${["#6f7d66", "#3b2f27", "#b8925a", "#e8e1d4", "#2f3a45"][seed % 5]}"/>
  <rect x="86" y="118" width="28" height="34" rx="10" fill="url(#s)"/>
  <ellipse cx="100" cy="92" rx="38" ry="45" fill="url(#s)"/>
  ${long ? `<path d="M62 84 Q66 46 100 44 Q136 46 140 84 Q120 62 100 66 Q80 62 62 84 Z" fill="${h}"/>`
         : `<path d="M62 86 Q60 46 100 44 Q140 46 138 86 Q132 64 100 62 Q70 62 62 86 Z" fill="${h}"/>`}
  <path d="M86 112 Q100 122 114 112" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>
</svg>`;
}

/* ---------------------------------------------------------- service / cover art */
const TOOTH = "M-60 -70 C-90 -70 -100 -40 -95 -10 C-90 25 -75 40 -70 80 C-66 110 -48 118 -40 90 C-32 60 -20 40 0 40 C20 40 32 60 40 90 C48 118 66 110 70 80 C75 40 90 25 95 -10 C100 -40 90 -70 60 -70 C35 -70 20 -58 0 -58 C-20 -58 -35 -70 -60 -70 Z";
const ICONS = {
  veneer: `<path d="${TOOTH}" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M-80 -30 C-60 -62 60 -62 80 -30 C70 20 50 50 0 54 C-50 50 -70 20 -80 -30 Z" fill="${GOLD}" opacity=".18" stroke="${GOLD}" stroke-width="2" transform="translate(70 10) rotate(8)"/>`,
  makeover: `<path d="M-150 -10 Q0 90 150 -10" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/><path d="M-120 0 Q0 60 120 0" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".5"/>${[-1, 1].map((s) => `<path d="M${s * 120} -70 l6 18 18 6 -18 6 -6 18 -6 -18 -18 -6 18 -6z" fill="${GOLD}"/>`).join("")}`,
  implant: `<path d="M-56 -110 C-76 -110 -80 -84 -76 -66 C-72 -50 -40 -46 0 -46 C40 -46 72 -50 76 -66 C80 -84 76 -110 56 -110 C36 -110 20 -100 0 -100 C-20 -100 -36 -110 -56 -110 Z" fill="none" stroke="${GOLD}" stroke-width="3"/><rect x="-26" y="-40" width="52" height="16" rx="4" fill="${GOLD}" opacity=".5"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M-${30 - i * 3} ${-16 + i * 24} L${30 - i * 3} ${-6 + i * 24}" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>`).join("")}<path d="M-18 128 L0 148 L18 128" fill="none" stroke="${GOLD}" stroke-width="4"/>`,
  whitening: `<path d="${TOOTH}" fill="${GOLD}" opacity=".12" stroke="${GOLD}" stroke-width="3"/>${[[-130, -90, 1.4], [120, -60, 1], [100, 90, .8], [-120, 70, .7]].map(([x, y, s]) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -26 l7 19 19 7 -19 7 -7 19 -7 -19 -19 -7 19 -7z" fill="${GOLD}"/>`).join("")}`,
  crown: `<path d="M-90 40 L-100 -60 L-50 -20 L0 -80 L50 -20 L100 -60 L90 40 Z" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/><path d="M-90 60 L90 60" stroke="${GOLD}" stroke-width="4"/><circle cx="0" cy="-90" r="8" fill="${GOLD}"/><path d="M-60 110 h120" stroke="${GOLD}" stroke-width="2" opacity=".5" stroke-dasharray="6 8"/>`,
  aligner: `<path d="M-160 -20 Q0 -100 160 -20 Q150 30 0 40 Q-150 30 -160 -20 Z" fill="${GOLD}" opacity=".1" stroke="${GOLD}" stroke-width="3"/>${[-120, -80, -40, 0, 40, 80, 120].map((x) => `<rect x="${x - 16}" y="${-48 + Math.pow(x / 40, 2) * 4}" width="32" height="56" rx="10" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".8"/>`).join("")}`,
  bonding: `<path d="${TOOTH}" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M40 -70 L95 -10 L60 -10 Z" fill="${GOLD}" opacity=".45"/><path d="M110 -120 l60 -60" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/><circle cx="104" cy="-114" r="10" fill="${GOLD}"/>`,
  calm: `<path d="M0 -120 C40 -70 40 -20 0 20 C-40 -20 -40 -70 0 -120 Z" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M0 20 C60 -10 110 -10 140 -50 C120 20 70 40 0 20 Z M0 20 C-60 -10 -110 -10 -140 -50 C-120 20 -70 40 0 20 Z" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M-160 80 Q-80 50 0 80 T160 80" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".6"/><path d="M-130 112 Q-65 88 0 112 T130 112" fill="none" stroke="${GOLD}" stroke-width="2" opacity=".35"/>`,
  journal: `<rect x="-90" y="-110" width="180" height="230" rx="12" fill="none" stroke="${GOLD}" stroke-width="3"/>${[-70, -40, -10, 20, 50].map((y) => `<path d="M-60 ${y} h${y === 50 ? 70 : 120}" stroke="${GOLD}" stroke-width="3" opacity=".6"/>`).join("")}`,
};
function art(icon, { w = 800, h = 600, bg = ["#241d17", "#14110e"], glow = "rgba(216,187,138,.22)", scale = 1.25, dy = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
  <radialGradient id="r" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="${glow}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
  <pattern id="d" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(246,242,235,.06)"/></pattern></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#d)"/><rect width="${w}" height="${h}" fill="url(#r)"/>
  <circle cx="${w / 2}" cy="${h / 2 + dy}" r="${Math.min(w, h) * 0.36}" fill="none" stroke="${GOLD}" stroke-opacity=".15"/>
  <g transform="translate(${w / 2} ${h / 2 + dy}) scale(${scale})">${ICONS[icon]}</g></svg>`;
}

/* ---------------------------------------------------------- hero (NYC skyline) */
function hero() {
  const b = [];
  let x = 0; let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  while (x < 800) { const w = 30 + rnd() * 50, h = 120 + rnd() * 260; b.push([x, w, h]); x += w + 4; }
  const sky = b.map(([x, w, h], i) => {
    const y = 1000 - h;
    const spire = i === 6 ? `<path d="M${x + w / 2} ${y - 120} L${x + w / 2} ${y}" stroke="${GOLD}" stroke-width="2"/><path d="M${x + 6} ${y} L${x + w / 2} ${y - 60} L${x + w - 6} ${y}" fill="none" stroke="${GOLD}" stroke-width="2"/>` : "";
    const win = [];
    for (let yy = y + 18; yy < 990; yy += 22) for (let xx = x + 8; xx < x + w - 8; xx += 14) if (rnd() > 0.72) win.push(`<rect x="${xx}" y="${yy}" width="5" height="8" fill="${GOLD}" opacity="${0.25 + rnd() * 0.5}"/>`);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1b1612" stroke="${GOLD}" stroke-opacity=".35"/>${win.join("")}${spire}`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f24"/><stop offset=".55" stop-color="#211b15"/><stop offset="1" stop-color="#14110e"/></linearGradient>
  <radialGradient id="m" cx="62%" cy="26%" r="40%"><stop offset="0" stop-color="rgba(240,225,196,.55)"/><stop offset="1" stop-color="rgba(240,225,196,0)"/></radialGradient></defs>
  <rect width="800" height="1000" fill="url(#g)"/><rect width="800" height="1000" fill="url(#m)"/>
  <circle cx="500" cy="260" r="70" fill="#f0e1c4" opacity=".9"/>
  ${[[120, 140], [220, 90], [660, 120], [700, 380], [90, 420], [340, 200]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#f0e1c4"/>`).join("")}
  <g transform="translate(400 470) scale(1.6)"><path d="M-150 -10 Q0 90 150 -10" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/><path d="M-118 0 Q0 58 118 0" fill="none" stroke="${GOLD}" stroke-width="1.5" opacity=".5"/></g>
  ${sky}
  <rect y="985" width="800" height="15" fill="#14110e"/>
</svg>`;
}

/* ---------------------------------------------------------- instagram tip cards */
function card(lines, { kicker, bg = IVORY, fg = INK, accent = GOLD2 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="${bg}"/><rect x="60" y="60" width="960" height="960" fill="none" stroke="${accent}" stroke-opacity=".5"/>
  <text x="120" y="210" font-family="Arial, sans-serif" font-size="30" letter-spacing="8" fill="${accent}" font-weight="700">${kicker}</text>
  ${lines.map((l, i) => `<text x="120" y="${380 + i * 120}" font-family="Georgia, serif" font-size="96" ${i === lines.length - 1 ? `font-style="italic" fill="${accent}"` : `fill="${fg}"`}>${l}</text>`).join("")}
  <text x="120" y="940" font-family="Arial, sans-serif" font-size="30" fill="${fg}" opacity=".6">Sutton Advanced Cosmetic Dentistry</text></svg>`;
}

(async () => {
  for (let i = 0; i < SMILES.length; i++) {
    await render(smile({ ...SMILES[i], before: true }), `demo/smile-${i + 1}-before.webp`, 800);
    await render(smile({ ...SMILES[i], before: false }), `demo/smile-${i + 1}-after.webp`, 800);
  }
  for (let i = 0; i < 16; i++) await render(avatar(i), `demo/avatar-${i + 1}.webp`, 160);
  const svc = { veneers: "veneer", makeover: "makeover", implants: "implant", whitening: "whitening", crowns: "crown", invisalign: "aligner", bonding: "bonding", painfree: "calm" };
  for (const [name, icon] of Object.entries(svc)) await render(art(icon), `demo/svc-${name}.webp`, 800);
  const covers = [["veneer", ["#2d241c", "#17120e"]], ["calm", ["#26302a", "#141a16"]], ["implant", ["#2a2420", "#121010"]], ["crown", ["#30261c", "#15110d"]], ["aligner", ["#262226", "#121014"]], ["whitening", ["#2b2520", "#141110"]]];
  for (let i = 0; i < covers.length; i++) await render(art(covers[i][0], { bg: covers[i][1], scale: 1.1 }), `demo/blog-${i + 1}.webp`, 768);
  await render(hero(), "demo/hero-nyc.webp", 900);
  await render(card(["Veneers that", "look like", "you."], { kicker: "SMILE NOTES" }), "demo/ig-1.webp", 720);
  await render(card(["3 signs", "you&#8217;re ready for", "a makeover"], { kicker: "TIP OF THE WEEK", bg: INK, fg: IVORY, accent: GOLD }), "demo/ig-2.webp", 720);
  await render(card(["Same-day", "crowns, made", "on-site."], { kicker: "ONE-VISIT DENTISTRY", bg: "#ece5d9" }), "demo/ig-3.webp", 720);
  await render(card(["Nervous?", "We go at", "your pace."], { kicker: "PAIN-FREE CARE", bg: "#26302a", fg: IVORY, accent: GOLD }), "demo/ig-4.webp", 720);
})();
