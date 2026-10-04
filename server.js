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

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 5173;

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
      const merged = [...fb.videos, ...videos].filter((v) => v.id && !seen.has(v.id) && seen.add(v.id));
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
  const file = path.join(DATA, "leads.json");
  let leads = [];
  try { leads = JSON.parse(await fsp.readFile(file, "utf8")); } catch {}
  leads.push(lead);
  await fsp.writeFile(file, JSON.stringify(leads, null, 2));
  console.log(`[lead] ${lead.channel}: ${lead.name} ${lead.phone || lead.email} — ${lead.service}`);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "GET") {
        const routes = { "/api/youtube": getYouTube, "/api/instagram": getInstagram, "/api/reviews": getReviews, "/api/blog": getBlog };
        const fn = routes[url.pathname];
        if (fn) return json(req, res, 200, await fn());
        if (url.pathname === "/api/status") {
          return json(req, res, 200, {
            youtube: "live (public RSS)",
            blog: "live (WordPress REST)",
            instagram: process.env.IG_ACCESS_TOKEN ? "live" : "demo data",
            reviews: process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACE_ID ? "live" : "fallback",
            assistant: process.env.ANTHROPIC_API_KEY ? "claude" : "local",
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
});

server.listen(PORT, () => {
  console.log(`\n  Sutton demo running →  http://localhost:${PORT}\n`);
  // Warm the upstream caches so the first visitor gets instant sections.
  Promise.allSettled([getYouTube(), getBlog()]);
});
