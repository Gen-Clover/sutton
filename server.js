// Sutton Advanced Cosmetic Dentistry — demo server.
// Zero-dependency static server + integration endpoints. Each integration
// tries the live source first and falls back to bundled data, so the demo
// always renders even without credentials.
//
//   PORT                   default 5173
//   IG_ACCESS_TOKEN        Instagram API (Instagram Login) long-lived token
//   GOOGLE_PLACES_API_KEY  Google Places API (New) key
//   GOOGLE_PLACE_ID        Place ID for the practice
//   ANTHROPIC_API_KEY      enables the Claude-backed AI concierge
//   BLOG_LIVE=1            pull posts from the practice's WordPress (off by default in the demo)
//   DEMO_EXPIRES           YYYY-MM-DD; after this date the site shows an "expired" page
//   DEMO_USER / DEMO_PASS  override the demo login (default user sutton@demo.com)
//   SESSION_SECRET         optional; signs the unlock cookie

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "site");
const DATA = path.join(ROOT, "data");
const ON_VERCEL = !!process.env.VERCEL;
const PORT = Number(process.env.PORT) || 5173;
const DEMO_EXPIRES = process.env.DEMO_EXPIRES || "2026-11-03";
const isExpired = () => Date.now() > new Date(DEMO_EXPIRES + "T23:59:59-05:00").getTime(); // end of day, New York

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg"]);

// ---------- tiny TTL cache for upstream calls ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, exp: Date.now() + ttlMs });
  return value;
}
const readJSON = async (f) => JSON.parse(await fsp.readFile(path.join(DATA, f), "utf8"));
const HOUR = 3600_000;

async function fetchWithTimeout(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- integrations ----------

// YouTube: public channel RSS feed — no API key required.
const YT_CHANNEL = "UC8NNxD2LZYscVN87f33VuzA";
async function getYouTube() {
  return cached("yt", HOUR, async () => {
    try {
      const r = await fetchWithTimeout(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL}`);
      if (!r.ok) throw new Error(`yt ${r.status}`);
      const xml = await r.text();
      const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
        id: e.match(/<yt:videoId>([^<]+)/)?.[1],
        title: decodeXml(e.match(/<title>([^<]+)/)?.[1] || ""),
        published: e.match(/<published>([^<]+)/)?.[1],
        views: Number(e.match(/views="(\d+)"/)?.[1] || 0),
      }));
      // Curated press clips first (the RSS feed only exposes the 15 latest uploads).
      const fb = await readJSON("youtube.fallback.json");
      const seen = new Set();
      const exclude = /fat joe/i; // videos featuring public figures are left out of the demo
      const merged = [...fb.videos, ...videos].filter((v) => v.id && !exclude.test(v.title) && !seen.has(v.id) && seen.add(v.id));
      return { source: "live", channelUrl: fb.channelUrl, videos: merged.slice(0, 9) };
    } catch (err) {
      console.warn("[youtube] falling back:", err.message);
      return readJSON("youtube.fallback.json");
    }
  });
}

// Instagram: Instagram API with Instagram Login (business/creator account).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
async function getInstagram() {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) return readJSON("instagram.demo.json");
  return cached("ig", 15 * 60_000, async () => {
    try {
      const base = "https://graph.instagram.com/v23.0";
      const [me, media] = await Promise.all([
        fetchWithTimeout(`${base}/me?fields=username,name,biography,profile_picture_url,followers_count,follows_count,media_count&access_token=${token}`).then((r) => r.json()),
        fetchWithTimeout(`${base}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp&limit=8&access_token=${token}`).then((r) => r.json()),
      ]);
      if (me.error) throw new Error(me.error.message);
      return {
        source: "live",
        profile: {
          username: me.username,
          name: me.name,
          bio: me.biography,
          avatar: me.profile_picture_url,
          posts: me.media_count,
          followers: me.followers_count,
          following: me.follows_count,
          url: `https://www.instagram.com/${me.username}/`,
        },
        media: (media.data || []).map((m) => ({
          id: m.id,
          type: m.media_type,
          image: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
          caption: m.caption || "",
          likes: m.like_count,
          comments: m.comments_count,
          permalink: m.permalink,
        })),
      };
    } catch (err) {
      console.warn("[instagram] falling back:", err.message);
      return readJSON("instagram.demo.json");
    }
  });
}

// Google reviews: Places API (New). Returns rating, total and up to 5 reviews.
// For the full review history, the Google Business Profile API is the upgrade path.
async function getReviews() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  const fallback = await readJSON("reviews.fallback.json");
  if (!key || !placeId) return fallback;
  return cached("reviews", 6 * HOUR, async () => {
    try {
      const r = await fetchWithTimeout(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error?.message || r.status);
      return {
        source: "live",
        rating: p.rating,
        total: p.userRatingCount,
        profileUrl: p.googleMapsUri,
        reviews: (p.reviews || []).map((rv) => ({
          author: rv.authorAttribution?.displayName,
          photo: rv.authorAttribution?.photoUri,
          rating: rv.rating,
          when: rv.relativePublishTimeDescription,
          text: rv.text?.text || rv.originalText?.text || "",
        })),
      };
    } catch (err) {
      console.warn("[reviews] falling back:", err.message);
      return fallback;
    }
  });
}

// Blog: the practice's existing WordPress REST API — publishes there show up here automatically.
async function getBlog() {
  if (process.env.BLOG_LIVE !== "1") return readJSON("blog.fallback.json");
  return cached("blog", HOUR, async () => {
    try {
      const r = await fetchWithTimeout(
        "https://www.suttonplacecosmeticdentist.com/wp-json/wp/v2/posts?per_page=6&_embed=wp:featuredmedia&_fields=id,date,link,title,excerpt,_links,_embedded",
        { headers: { "User-Agent": "Mozilla/5.0 (SuttonDemo)" } },
        8000
      );
      if (!r.ok) throw new Error(`wp ${r.status}`);
      const posts = await r.json();
      return {
        source: "live",
        posts: posts.map((p) => {
          const media = p._embedded?.["wp:featuredmedia"]?.[0];
          return {
            id: p.id,
            date: p.date,
            link: p.link,
            title: decodeXml(p.title.rendered),
            excerpt: decodeXml(p.excerpt.rendered.replace(/<[^>]+>/g, "")).trim(),
            image: media?.media_details?.sizes?.medium_large?.source_url || media?.media_details?.sizes?.medium?.source_url || media?.source_url,
          };
        }),
      };
    } catch (err) {
      console.warn("[blog] falling back:", err.message);
      return readJSON("blog.fallback.json");
    }
  });
}

// ---------- AI concierge (Claude) ----------
let anthropic = null;
let systemPrompt = null;
async function getClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (anthropic) return anthropic;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic();
    const kb = JSON.parse(await fsp.readFile(path.join(PUBLIC, "data", "practice.json"), "utf8"));
    systemPrompt =
      `You are "Ava", the virtual concierge for ${kb.name} in Manhattan, New York. ` +
      `Answer warmly and briefly (2–4 short sentences), in the tone of a luxury NYC practice. ` +
      `Only use the practice facts below; if something isn't covered (exact prices, medical diagnosis), say the team will confirm and offer a free consultation or a call to ${kb.phone}. ` +
      `Never give a diagnosis. For emergencies, tell them to call the office immediately. ` +
      `When the visitor wants to book, ask for their name, phone and preferred day, then say a coordinator will confirm.\n\n` +
      `PRACTICE FACTS (JSON):\n${JSON.stringify(kb)}`;
    return anthropic;
  } catch (err) {
    console.warn("[chat] Claude SDK unavailable, using local assistant:", err.message);
    return null;
  }
}

async function chat(body) {
  const client = await getClaude();
  if (!client) return { status: 503, data: { mode: "local" } };
  const history = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  // Normalise: drop leading assistant turns (Ava greets first) and merge consecutive same-role turns.
  const messages = [];
  for (const m of history) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) continue;
    if (!messages.length && m.role !== "user") continue;
    const content = m.content.slice(0, 2000);
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + content;
    else messages.push({ role: m.role, content });
  }
  if (!messages.length || messages[0].role !== "user") return { status: 400, data: { error: "bad history" } };
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system: systemPrompt,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { status: 200, data: { mode: "claude", reply: `I'm not able to help with that here, but our team can — call us at 212-751-5665.` } };
    }
    const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return { status: 200, data: { mode: "claude", reply } };
  } catch (err) {
    console.warn("[chat] Claude error, client will use local assistant:", err?.status, err?.message);
    return { status: 503, data: { mode: "local" } };
  }
}

// ---------- leads (demo store) ----------
async function saveLead(body) {
  const lead = {
    at: new Date().toISOString(),
    channel: String(body.channel || "web").slice(0, 30),
    name: String(body.name || "").slice(0, 120),
    phone: String(body.phone || "").slice(0, 40),
    email: String(body.email || "").slice(0, 160),
    service: String(body.service || "").slice(0, 120),
    message: String(body.message || "").slice(0, 2000),
  };
  if (!lead.name || !(lead.phone || lead.email)) return { status: 400, data: { error: "Name and phone or email are required." } };
  // Always log first: on Vercel the filesystem is read-only (except /tmp, which is
  // ephemeral and not shared across instances), so the function log is the one
  // durable record there until this is wired to email/CRM/a database.
  console.log(`[lead] ${lead.channel}: ${lead.name} ${lead.phone || lead.email} — ${lead.service} :: ${JSON.stringify(lead)}`);
  const file = path.join(ON_VERCEL ? "/tmp" : DATA, "leads.json");
  try {
    let leads = [];
    try { leads = JSON.parse(await fsp.readFile(file, "utf8")); } catch {}
    leads.push(lead);
    await fsp.writeFile(file, JSON.stringify(leads, null, 2));
  } catch (err) {
    console.warn("[lead] could not persist to disk (non-fatal):", err.message);
  }
  return { status: 200, data: { ok: true } };
}

// ---------- http ----------
function decodeXml(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function send(req, res, status, body, type, extra = {}) {
  const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...extra };
  const accept = req.headers["accept-encoding"] || "";
  if (typeof body === "string") body = Buffer.from(body);
  if (body.length > 1024 && /\bbr\b/.test(accept) && extra.compress !== false) {
    body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
    headers["Content-Encoding"] = "br";
  } else if (body.length > 1024 && /\bgzip\b/.test(accept) && extra.compress !== false) {
    body = zlib.gzipSync(body);
    headers["Content-Encoding"] = "gzip";
  }
  delete headers.compress;
  headers["Content-Length"] = body.length;
  headers["Vary"] = "Accept-Encoding";
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}
const json = (req, res, status, data) => send(req, res, status, JSON.stringify(data), MIME[".json"], { "Cache-Control": "no-store" });

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64_000) throw new Error("too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const staticCache = new Map(); // path -> {buf, mtime}
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(req, res, 403, "Forbidden", "text/plain");
  let stat;
  try { stat = await fsp.stat(file); } catch { return send(req, res, 404, "Not found", "text/plain"); }
  if (stat.isDirectory()) return serveStatic(req, res, rel + "/");
  const ext = path.extname(file).toLowerCase();
  let entry = staticCache.get(file);
  if (!entry || entry.mtime !== stat.mtimeMs) {
    entry = { buf: await fsp.readFile(file), mtime: stat.mtimeMs };
    staticCache.set(file, entry);
  }
  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
  const isAsset = /^\/(img|fonts)\//.test(rel);
  send(req, res, 200, entry.buf, MIME[ext] || "application/octet-stream", {
    ETag: etag,
    "Cache-Control": isAsset ? "public, max-age=604800, immutable" : "no-cache",
    compress: COMPRESSIBLE.has(ext),
  });
}

const EXPIRED_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Demo expired</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14110e;color:#f6f2eb;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}
h1{font:400 2.4rem Georgia,serif;margin:0 0 12px}p{color:rgba(246,242,235,.65);max-width:460px;margin:0 auto}span{color:#d8bb8a}</style></head>
<body><div><h1>This demo has <span>expired</span></h1><p>This was a temporary concept preview and is no longer available. It was never the official website of Sutton Advanced Cosmetic Dentistry.</p></div></body></html>`;

// ---------- access gate ----------
// The whole site sits behind one demo login. Until unlocked, "/" serves a
// stripped preview (banner + header + hero) under a blocking popup, and every
// other page, asset and API returns 401. Only a scrypt hash of the password is
// kept here; DEMO_USER / DEMO_PASS env vars override the defaults.
const GATE_USER = (process.env.DEMO_USER || "sutton@demo.com").toLowerCase();
const GATE_SALT = "sutton-demo-gate-v1";
const GATE_HASH = process.env.DEMO_PASS
  ? crypto.scryptSync(process.env.DEMO_PASS, GATE_SALT, 32)
  : Buffer.from("a88e9076a08bf6580120c874812bf7c3819af1c05545461af9e43aa1d88d2b6b", "hex");
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update("session:" + GATE_HASH.toString("hex")).digest();
const SESSION_DAYS = 7;
const COOKIE = "sutton_demo";
// assets the locked preview needs; everything else requires a session
const GATE_PUBLIC = new Set(["/css/style.css", "/img/favicon.svg", "/img/demo/hero-nyc.webp", "/api/unlock"]);

const sign = (v) => crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("base64url");
function hasSession(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [exp, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const a = Buffer.from(mac), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function checkCredentials(email, password) {
  const userOk = String(email || "").trim().toLowerCase() === GATE_USER;
  const passOk = crypto.timingSafeEqual(crypto.scryptSync(String(password || ""), GATE_SALT, 32), GATE_HASH);
  return userOk && passOk;
}
const attempts = new Map(); // ip -> {n, reset}
function rateLimited(ip) {
  const now = Date.now(), a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + 15 * 60_000 }); return false; }
  return ++a.n > 10;
}
async function unlock(req, res) {
  // req.socket may be absent on some serverless runtimes; x-forwarded-for is
  // set by Vercel's proxy and is the more reliable source there anyway.
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "?";
  if (rateLimited(ip)) return json(req, res, 429, { error: "Too many attempts. Please try again in 15 minutes." });
  const { email, password } = await readBody(req);
  if (!checkCredentials(email, password)) return json(req, res, 401, { error: "Incorrect email or password." });
  attempts.delete(ip);
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return json(req, res, 200, { ok: true });
}

// Locked preview: the real header + hero (blurred), no app script, plus the unlock popup.
async function gatePage() {
  const html = await fsp.readFile(path.join(PUBLIC, "index.html"), "utf8");
  const cut = html.indexOf("<!-- ================= CELEB MARQUEE");
  return html.slice(0, cut) + `</main>
<div class="gate" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
  <form class="gate-card" id="gateForm" novalidate>
    <span class="gate-lock" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></span>
    <h2 id="gateTitle">Unlock the demo <em>now</em>&nbsp;!!!</h2>
    <p>This private concept preview for Sutton Advanced Cosmetic Dentistry is password-protected. Enter the access details from your email.</p>
    <label for="gEmail">Email</label>
    <input id="gEmail" name="email" type="email" autocomplete="username" required autofocus>
    <label for="gPass">Password</label>
    <input id="gPass" name="password" type="password" autocomplete="current-password" required>
    <button class="btn btn-gold btn-block" type="submit">Unlock the demo</button>
    <p class="gate-msg" id="gateMsg" role="alert"></p>
  </form>
</div>
<script>
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  document.documentElement.style.setProperty("--bh", document.getElementById("demoBanner").offsetHeight + "px");
  const f = document.getElementById("gateForm"), msg = document.getElementById("gateMsg");
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") e.preventDefault(); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); btn.disabled = true; msg.textContent = "Checking…";
    try {
      const r = await fetch("/api/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email.value, password: f.password.value }) });
      const d = await r.json();
      if (r.ok) { msg.textContent = "Unlocked. Loading…"; location.reload(); return; }
      msg.textContent = d.error || "Incorrect email or password.";
      f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
      f.password.select();
    } catch { msg.textContent = "Connection problem. Please try again."; }
    btn.disabled = false;
  });
</script>
</body>
</html>`;
}

// The actual request handler. Reused as-is by both the local `http.createServer`
// listener below and the Vercel serverless function in api/index.js, so the
// routing, the gate and every route behave identically on both.
export async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (isExpired()) {
    if (url.pathname.startsWith("/api/")) return json(req, res, 410, { error: "demo expired" });
    return send(req, res, 410, EXPIRED_PAGE, MIME[".html"], { "Cache-Control": "no-store" });
  }
  try {
    if (url.pathname === "/api/unlock" && req.method === "POST") return await unlock(req, res);
    if (!hasSession(req) && !GATE_PUBLIC.has(url.pathname)) {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return send(req, res, 200, await gatePage(), MIME[".html"], { "Cache-Control": "no-store", compress: true });
      }
      if (url.pathname.startsWith("/api/")) return json(req, res, 401, { error: "locked" });
      return send(req, res, 401, "Locked demo", "text/plain", { "Cache-Control": "no-store" });
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "GET") {
        const routes = { "/api/youtube": getYouTube, "/api/instagram": getInstagram, "/api/reviews": getReviews, "/api/blog": getBlog };
        const fn = routes[url.pathname];
        if (fn) return json(req, res, 200, await fn());
        if (url.pathname === "/api/status") {
          return json(req, res, 200, {
            youtube: "live (public RSS)",
            blog: process.env.BLOG_LIVE === "1" ? "live (WordPress REST)" : "demo data",
            instagram: process.env.IG_ACCESS_TOKEN ? "live" : "demo data",
            reviews: process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACE_ID ? "live" : "demo data",
            assistant: process.env.ANTHROPIC_API_KEY ? "claude" : "local",
            demoExpires: DEMO_EXPIRES,
          });
        }
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        if (url.pathname === "/api/chat") { const r = await chat(body); return json(req, res, r.status, r.data); }
        if (url.pathname === "/api/lead") { const r = await saveLead(body); return json(req, res, r.status, r.data); }
      }
      return json(req, res, 404, { error: "not found" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(req, res, 405, "Method not allowed", "text/plain");
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    json(req, res, 500, { error: "server error" });
  }
}
// Also export as default: Vercel's build has been observed resolving the
// function entry back to this bundled file (as server.mjs) rather than
// api/index.js's re-export, which failed with "the default export must be
// a function" when this file only had the named export above.
export default handleRequest;

// Only start a persistent listener when this file is run directly
// (`node server.js` / `npm start` / `npm run dev`), never when it's imported
// as a module — which is what api/index.js does on Vercel. Deliberately not
// based on process.env.VERCEL: calling .listen() inside a serverless function
// crashes the whole invocation (FUNCTION_INVOCATION_FAILED on every request,
// including the homepage), so this must not depend on a platform env var
// being set/exposed as expected — it's checked structurally instead.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`\n  Sutton demo running →  http://localhost:${PORT}   (demo expires ${DEMO_EXPIRES})\n`);
    // Warm the upstream caches so the first visitor gets instant sections.
    Promise.allSettled([getYouTube()]);
  });
}
