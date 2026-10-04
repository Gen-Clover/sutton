// Illustrated smile (no real person). before=true applies the "issues".
const W = [60, 50, 46, 40, 35, 30];
module.exports = function smile({ skin, lip, before = false, issues = {} }) {
  const cx = 400, gumY = 236;
  const edge = (m) => 372 - Math.pow((m - cx) / 250, 2) * 78; // smile arc follows the lower lip
  const toothPath = (xm, w, e) => `M${xm} ${gumY} H${xm + w} V${e - 14} Q${xm + w} ${e} ${xm + w - 14} ${e} H${xm + 14} Q${xm} ${e} ${xm} ${e - 14} Z`;
  const teeth = [], lower = [];
  for (const side of [1, -1]) {
    let x = before && issues.gap ? issues.gap / 2 : 1.5;
    for (let i = 0; i < W.length; i++) {
      const w = W[i] * (before && issues.crowd && i === 1 ? 0.86 : 1);
      const xm = side === 1 ? cx + x : cx - x - w, mid = xm + w / 2;
      let e = edge(mid), rot = 0, fill = "url(#tw)";
      if (before) {
        if (issues.stain) fill = i < 2 ? "url(#ty)" : "url(#ty2)";
        if (issues.uneven) e += [0, -16, 8, -6, 4, 0][i] * (side === 1 ? 1 : 0.5);
        if (issues.crowd && i === 1) { rot = side * 10; e += 4; }
        if (issues.crowd && i === 2) rot = -side * 6;
        if (issues.dark && i === 0 && side === -1) fill = "url(#td)";
      }
      const chip = before && issues.chip && i === 0 && side === 1
        ? `<path d="M${xm + w * 0.4} ${e + 2} L${xm + w + 2} ${e - 26} L${xm + w + 2} ${e + 2} Z" fill="#2a0f12"/>` : "";
      teeth.push(`<g transform="rotate(${rot} ${mid} ${e - 40})">
        <path d="${toothPath(xm, w, e)}" fill="${fill}"/>
        <path d="${toothPath(xm, w, e)}" fill="#3a2418" opacity="${(i * 0.09).toFixed(2)}"/>
        <rect x="${xm + w * 0.2}" y="${gumY + 40}" width="${w * 0.2}" height="${(e - gumY) * 0.5}" rx="${w * 0.1}" fill="#fff" opacity="${before && issues.stain ? 0.15 : 0.4}"/>${chip}</g>`);
      const lw = w * 0.78, lx = side === 1 ? cx + x * 0.8 : cx - x * 0.8 - lw;
      lower.push(`<rect x="${lx}" y="${edge(lx + lw / 2) + 16}" width="${lw}" height="60" rx="12" fill="${before && issues.stain ? "url(#ty2)" : "url(#tw)"}" opacity=".28"/>`);
      x += w + 3;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="sk" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="${skin[0]}"/><stop offset="1" stop-color="${skin[1]}"/></radialGradient>
    <linearGradient id="lu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lip[0]}"/><stop offset="1" stop-color="${lip[1]}"/></linearGradient>
    <linearGradient id="ll" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lip[1]}"/><stop offset=".4" stop-color="${lip[0]}"/><stop offset="1" stop-color="${lip[1]}"/></linearGradient>
    <linearGradient id="tw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece8e0"/><stop offset=".6" stop-color="#fdfcf9"/><stop offset="1" stop-color="#e6e2da"/></linearGradient>
    <linearGradient id="ty" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfb68a"/><stop offset=".6" stop-color="#e6d3ad"/><stop offset="1" stop-color="#c9ae80"/></linearGradient>
    <linearGradient id="ty2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2a473"/><stop offset="1" stop-color="#b39566"/></linearGradient>
    <linearGradient id="td" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#958268"/><stop offset="1" stop-color="#837058"/></linearGradient>
    <clipPath id="mouth"><path d="M128 300 Q400 236 672 300 Q560 470 400 476 Q240 470 128 300 Z"/></clipPath>
    <filter id="soft"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <rect width="800" height="800" fill="url(#sk)"/>
  <ellipse cx="400" cy="380" rx="320" ry="180" fill="#000" opacity=".08" filter="url(#soft)"/>
  <g clip-path="url(#mouth)">
    <rect width="800" height="800" fill="#2a0f12"/>
    <ellipse cx="400" cy="470" rx="200" ry="60" fill="#7a3036" opacity=".6"/>
    ${lower.join("")}
    <path d="M100 236 H700 V290 Q400 238 100 290 Z" fill="#d77880"/>
    ${teeth.join("")}
  </g>
  <path d="M100 300 Q240 186 340 214 Q400 232 460 214 Q560 186 700 300 Q600 262 400 258 Q200 262 100 300 Z" fill="url(#lu)"/>
  <path d="M100 300 Q240 470 400 480 Q560 470 700 300 Q620 540 400 556 Q180 540 100 300 Z" fill="url(#ll)"/>
  <ellipse cx="400" cy="516" rx="130" ry="12" fill="#fff" opacity=".16"/>
</svg>`;
};
