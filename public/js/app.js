import { initAssistant, openAssistant } from "./assistant.js";
import { initWhatsApp } from "./whatsapp.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K" : n?.toLocaleString("en-US"));
const getJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));

/* ---------------- services data (tile deck) ---------------- */
export const SERVICES = [
  { name: "Porcelain Veneers", sub: "Handcrafted in our on-site lab", img: "/img/blog/how-porcelain-veneers-are-made-for-natural-smiles.webp" },
  { name: "Smile Makeover", sub: "Designed around your face", img: "/img/ba/ba3.webp" },
  { name: "Dental Implants", sub: "Natural, permanent, bone-preserving", img: "/img/blog/how-to-choose-implant-material-for-a-natural-smile.webp" },
  { name: "Laser Teeth Whitening", sub: "Dramatic results in one visit", img: "/img/ba/ba1.webp" },
  { name: "One-Visit Dentistry (CEREC)", short: "One-Visit Crowns", sub: "Scan, mill and fit the same day", img: "/img/blog/how-one-visit-crowns-work-for-a-faster-smile.webp" },
  { name: "Invisalign", sub: "Discreet clear aligners", img: "/img/ba/ba7.webp" },
  { name: "Teeth Bonding", sub: "Quick fixes for chips & gaps", img: "/img/blog/dental-bonding-versus-crowns-for-a-better-smile.webp" },
  { name: "Pain-Free Dentistry", sub: "Comfort-first, anxiety-friendly", img: "/img/blog/sedation-dentistry-versus-nitrous-oxide.webp" },
];
let practice = null;
const practiceReady = getJSON("/data/practice.json").then((p) => (practice = p));

/* ---------------- nav ---------------- */
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 30);
addEventListener("scroll", onScroll, { passive: true });
onScroll();
const burger = $("#burger"), menu = $("#mobileMenu");
burger.addEventListener("click", () => {
  const open = burger.getAttribute("aria-expanded") !== "true";
  burger.setAttribute("aria-expanded", open);
  menu.classList.toggle("open", open);
  if (open) nav.classList.add("scrolled");
});
menu.addEventListener("click", (e) => { if (e.target.tagName === "A") { burger.setAttribute("aria-expanded", "false"); menu.classList.remove("open"); } });

/* ---------------- reveal on scroll ---------------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
const observe = (root = document) => $$(".reveal:not(.in)", root).forEach((el) => io.observe(el));
observe();

/* ---------------- celeb marquee ---------------- */
const celebs = ["nicki-minaj", "idris", "shania-twain", "fj2", "eve", "ashanti", "trina", "sw", "djfhaled2", "fetty-wap", "angie-martinez", "sunny-anderson", "dj-enuff", "lil2", "fb-1", "emily-bustamante", "lorena-cartagena", "lac", "andrea-martin", "merle-louise"];
const celebHTML = celebs.map((c) => `<img src="/img/celeb/${c}.webp" alt="" width="78" height="78" loading="lazy" decoding="async">`).join("");
$("#celebTrack").innerHTML = celebHTML + celebHTML; // duplicated for a seamless loop

/* ---------------- services deck ---------------- */
const deck = $("#deck");
const perRow = () => (matchMedia("(max-width: 640px)").matches ? 2 : matchMedia("(max-width: 1080px)").matches ? 3 : 4);
let lastPer = 0;
function renderDeck() {
  const per = perRow();
  if (per === lastPer) return;
  lastPer = per;
  const tiles = SERVICES.map((s, i) => `
    <button class="tile" data-service="${esc(s.name)}" aria-label="${esc(s.name)}: view details">
      <h3 class="tile-title">${esc(s.short || s.name)}<small>${esc(s.sub)}</small></h3>
      <div class="tile-bar"><span></span></div>
      <div class="tile-media">
        <img src="${s.img}" alt="" loading="lazy" decoding="async">
        <span class="tile-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="tile-go"><svg><use href="#i-arrow"/></svg></span>
      </div>
    </button>`);
  let html = "";
  for (let i = 0; i < tiles.length; i += per) html += `<div class="deck-row reveal">${tiles.slice(i, i + per).join("")}</div>`;
  deck.innerHTML = html;
  observe(deck);
}
renderDeck();
addEventListener("resize", () => requestAnimationFrame(renderDeck), { passive: true });

practiceReady.then(() => {
  const featured = new Set(SERVICES.map((s) => s.name));
  $("#moreServices").innerHTML = practice.services
    .filter((s) => !featured.has(s.name))
    .map((s) => `<button data-service="${esc(s.name)}">${esc(s.name)}</button>`).join("");
  $("#f-service").innerHTML = `<option value="">Select a treatment…</option>` +
    practice.services.map((s) => `<option>${esc(s.name)}</option>`).join("") + `<option>Not sure yet</option>`;
});

/* service modal */
const modal = $("#svcModal");
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-service]");
  if (!t || !practice) return;
  const name = t.dataset.service;
  const info = practice.services.find((s) => s.name === name);
  const tile = SERVICES.find((s) => s.name === name);
  $("#svcTitle").textContent = name;
  $("#svcText").textContent = (info?.summary || "") + " Every plan begins with a complimentary, in-person consultation with Dr. Fajiram or Dr. Monahemi.";
  $("#svcImg").src = tile?.img || "/img/office.webp";
  $("#svcImg").alt = name;
  modal.dataset.svc = name;
  modal.showModal();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal || e.target.closest("[data-close]")) {
    if (e.target.closest("#svcBook")) $("#f-service").value = modal.dataset.svc;
    modal.close();
  }
});
$("#svcAsk").addEventListener("click", () => {
  modal.close();
  openAssistant(`Tell me about ${modal.dataset.svc}`);
});

/* ---------------- before / after ---------------- */
// o: how the before/after composite is laid out (lr = side by side, tb = stacked)
const BA = [["ba3", "lr"], ["ba1", "lr"], ["ba7", "tb"], ["ba2", "lr"], ["ba5", "tb"], ["ba8", "tb"], ["ba6", "tb"], ["ba4", "lr"]];
const ba = $("#ba"), baRange = $("#baRange");
function setBA(id) {
  ba.dataset.o = BA.find(([x]) => x === id)[1];
  const url = `url(/img/ba/${id}.webp)`;
  $$(".ba-img", ba).forEach((el) => (el.style.backgroundImage = url));
  $$("#baThumbs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === id));
}
$("#baThumbs").innerHTML = BA.map(([id], i) => `<button data-id="${id}" aria-label="Show smile ${i + 1}" aria-pressed="false"><img src="/img/ba/${id}.webp" alt="" loading="lazy" decoding="async"></button>`).join("");
$("#baThumbs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setBA(b.dataset.id); });
baRange.addEventListener("input", () => ba.style.setProperty("--pos", baRange.value + "%"));
setBA(BA[0][0]);
// gentle "hint" sweep the first time the slider scrolls into view
new IntersectionObserver(([e], obs) => {
  if (!e.isIntersecting) return;
  obs.disconnect();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 1600);
    const v = 50 + Math.sin(p * Math.PI * 2) * 22 * (1 - p);
    ba.style.setProperty("--pos", v + "%"); baRange.value = v;
    if (p < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 400);
}, { threshold: 0.5 }).observe(ba);

/* ---------------- sync badges ---------------- */
function badge(el, source, liveText, otherText) {
  el.className = "sync " + (source === "live" ? "live" : "demo");
  el.textContent = source === "live" ? liveText : otherText;
}

/* ---------------- YouTube (live RSS via server) ---------------- */
let ytVideos = [];
function playYT(i, autoplay = false) {
  const v = ytVideos[i];
  const player = $("#ytPlayer");
  if (autoplay) {
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  } else {
    // lite embed: just a poster until the visitor clicks (keeps the page fast)
    player.innerHTML = `<button class="yt-poster" data-i="${i}" aria-label="Play ${esc(v.title)}">
      <img src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
      <span class="yt-play"><svg><use href="#i-play"/></svg></span>
      <span class="yt-cap">${esc(v.title)}</span></button>`;
  }
  $$("#ytList button").forEach((b) => b.setAttribute("aria-current", +b.dataset.i === i));
}
getJSON("/api/youtube").then((d) => {
  ytVideos = d.videos;
  $("#ytList").innerHTML = ytVideos.map((v, i) => `<li><button data-i="${i}">
    <img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" decoding="async" width="132" height="74">
    <span><strong>${esc(v.title)}</strong>${v.views ? `<small>${fmt(v.views)} views</small>` : `<small>Sutton Advanced Cosmetic Dentistry</small>`}</span></button></li>`).join("");
  playYT(0);
  badge($("#ytSync"), d.source, "Live · auto-synced from YouTube", "Synced playlist");
}).catch(() => ($("#ytSync").textContent = "Offline"));
$("#ytList").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) playYT(+b.dataset.i, true); });
$("#ytPlayer").addEventListener("click", (e) => { const b = e.target.closest(".yt-poster"); if (b) playYT(+b.dataset.i, true); });

/* ---------------- Instagram ---------------- */
getJSON("/api/instagram").then(({ source, profile: p, media }) => {
  $("#igProfile").innerHTML = `
    <div class="ig-avatar"><img src="${esc(p.avatar)}" alt="${esc(p.name)}" loading="lazy"></div>
    <div class="ig-meta">
      <div class="ig-top">
        <h3><svg><use href="#i-ig"/></svg>${esc(p.username)}</h3>
        <a class="ig-follow" href="${esc(p.url)}" target="_blank" rel="noopener">Follow</a>
        <span class="sync ${source === "live" ? "live" : "demo"}">${source === "live" ? "Live · synced from Instagram" : "Demo data · goes live via Instagram API"}</span>
      </div>
      <ul class="ig-stats">
        <li><b data-count="${p.posts}">0</b> posts</li>
        <li><b data-count="${p.followers}">0</b> followers</li>
        <li><b data-count="${p.following}">0</b> following</li>
      </ul>
      <p class="ig-name">${esc(p.name)}</p>
      <p class="ig-bio">${esc(p.bio)}</p>
    </div>`;
  $("#igGrid").innerHTML = media.map((m) => `
    <a class="ig-post reveal" href="${esc(m.permalink || p.url)}" target="_blank" rel="noopener">
      <img src="${esc(m.image)}" alt="" loading="lazy" decoding="async">
      ${m.type === "VIDEO" ? `<svg class="ig-type"><use href="#i-play"/></svg>` : ""}
      <div class="ig-over"><div class="n"><span><svg><use href="#i-heart"/></svg>${fmt(m.likes ?? 0)}</span><span><svg><use href="#i-comment"/></svg>${fmt(m.comments ?? 0)}</span></div><p>${esc(m.caption)}</p></div>
    </a>`).join("");
  observe($("#igGrid"));
  countUp($$("[data-count]", $("#igProfile")));
}).catch(() => {});

function countUp(els) {
  const ob = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    ob.unobserve(e.target);
    const end = +e.target.dataset.count, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 1400), eased = 1 - Math.pow(1 - p, 3);
      e.target.textContent = fmt(Math.round(end * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: 0.6 });
  els.forEach((el) => ob.observe(el));
}

/* ---------------- Google reviews ---------------- */
getJSON("/api/reviews").then((d) => {
  $("#gSummary").innerHTML = `<svg class="g-logo"><use href="#i-google"/></svg>
    <div><strong>${d.rating.toFixed(1)}</strong><div class="stars">${'<svg><use href="#i-star"/></svg>'.repeat(Math.round(d.rating))}</div>
    <span><a href="${esc(d.profileUrl)}" target="_blank" rel="noopener">${d.total} Google reviews ↗</a></span></div>`;
  $("#rvTrack").innerHTML = d.reviews.map((r) => `
    <article class="rv">
      <div class="rv-top"><div class="stars">${'<svg><use href="#i-star"/></svg>'.repeat(r.rating)}</div><svg class="g-logo" style="width:22px;height:22px"><use href="#i-google"/></svg></div>
      <p>“${esc(r.text)}”</p>
      <div class="rv-who">${r.photo ? `<img class="rv-av" src="${esc(r.photo)}" alt="" loading="lazy">` : `<span class="rv-av">${esc(r.author?.[0] || "G")}</span>`}
        <div><strong>${esc(r.author)}</strong><small>${esc(r.when)}</small></div></div>
    </article>`).join("");
  badge($("#rvSync"), d.source, "Live · Google Places API", "Showing published reviews · goes live via Google API");
}).catch(() => {});
$(".rv-nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rv]");
  if (!b) return;
  const track = $("#rvTrack");
  track.scrollBy({ left: +b.dataset.rv * (track.clientWidth / (innerWidth < 640 ? 1 : innerWidth < 900 ? 2 : 3) + 8), behavior: "smooth" });
});

/* ---------------- Blog (live WordPress) ---------------- */
getJSON("/api/blog").then((d) => {
  $("#blogGrid").innerHTML = d.posts.slice(0, 6).map((p) => `
    <a class="post reveal" href="${esc(p.link)}" target="_blank" rel="noopener">
      <div class="post-img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : ""}</div>
      <div class="post-body">
        <time datetime="${esc(p.date)}">${new Date(p.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</time>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt)}</p>
        <span class="more">Read article <svg><use href="#i-arrow"/></svg></span>
      </div>
    </a>`).join("");
  observe($("#blogGrid"));
  badge($("#blogSync"), d.source, "Live · auto-published from your blog", "Latest articles");
}).catch(() => {});

/* ---------------- lazy map ---------------- */
const map = $("#map");
new IntersectionObserver(([e], obs) => {
  if (!e.isIntersecting) return;
  obs.disconnect();
  map.innerHTML = `<iframe src="${map.dataset.src}" loading="lazy" title="Map to Sutton Advanced Cosmetic Dentistry" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}, { rootMargin: "400px" }).observe(map);

/* ---------------- booking form ---------------- */
const form = $("#bookForm"), formMsg = $("#formMsg");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const nameOk = data.name.trim().length > 1, phoneOk = data.phone.replace(/\D/g, "").length >= 7;
  $("#f-name").setAttribute("aria-invalid", !nameOk);
  $("#f-phone").setAttribute("aria-invalid", !phoneOk);
  if (!nameOk || !phoneOk) { formMsg.textContent = "Please add your name and a phone number."; return; }
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; formMsg.textContent = "Sending…";
  try {
    const r = await fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, channel: "website form", message: `[prefers ${data.contact}] ${data.message || ""}` }) });
    if (!r.ok) throw new Error();
    form.reset();
    formMsg.textContent = `Thank you, ${data.name.split(" ")[0]}! A care coordinator will contact you shortly.`;
  } catch {
    formMsg.textContent = "Something went wrong. Please call 212-751-5665.";
  } finally { btn.disabled = false; }
});

/* ---------------- widgets ---------------- */
$$("[data-open-assistant]").forEach((b) => b.addEventListener("click", () => openAssistant()));
practiceReady.then(() => {
  initAssistant(practice, SERVICES);
  initWhatsApp(practice);
});
