# Sutton Advanced Cosmetic Dentistry: concept site

Demo website for **suttonplacecosmeticdentist.com**, built for an email outreach campaign.
It has no build step and no frameworks: one Node server plus static HTML, CSS and JS.

```bash
npm install     # optional; only needed for the Claude-powered assistant
npm start       # http://localhost:5173
```

## Integrations (live → fallback)

Each section calls a server endpoint. The endpoint uses the live source when it's available and otherwise falls back to bundled data, so the demo never shows an empty section.

| Section | Endpoint | Live source | Needs | Today |
|---|---|---|---|---|
| YouTube | `/api/youtube` | Public channel RSS feed | nothing | **Live** |
| Journal / blog | `/api/blog` | Their WordPress REST API (`/wp-json/wp/v2/posts`) | nothing | **Live** |
| Instagram | `/api/instagram` | Instagram API with Instagram Login (`graph.instagram.com/me`, `/me/media`) | `IG_ACCESS_TOKEN` (Business/Creator account) | Demo data |
| Google reviews | `/api/reviews` | Google Places API (New): rating, count, latest 5 reviews | `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | Fallback (their published Google reviews) |
| AI concierge "Ava" | `/api/chat` | Claude (`claude-opus-5-5`) grounded on `public/data/practice.json` | `ANTHROPIC_API_KEY` | Built-in local assistant |
| Leads (form, Ava booking) | `/api/lead` | Writes `data/leads.json` (swap for email, CRM or Google Sheets) | nothing | Working |
| WhatsApp | (client) | Simulated chat; production = WhatsApp Business Cloud API | WABA number | Demo data |

Copy `.env.example` to `.env` to switch an integration from demo to live. `npm start` loads it automatically.
Live responses are cached server-side (YouTube and blog for 1 h, Instagram for 15 min, reviews for 6 h).

## Structure

```
server.js              static server (brotli/gzip, ETag) + API routes
data/                  fallback/demo data, plus leads.json (created on first lead)
public/index.html      single page
public/css/style.css   design system (ivory, espresso and champagne gold)
public/js/app.js       sections, tile deck, before/after slider, YouTube lite-embed, form
public/js/assistant.js Ava: intent engine, booking flow, Claude mode
public/js/whatsapp.js  WhatsApp widget (simulated)
public/data/practice.json  practice knowledge base (shared by Ava and the Claude prompt)
```

The treatment tiles follow the portfolio deck on unitedofweb.com: overlapping cards with a left shadow. The hovered card lifts by `translateY(-20px)`, the cards after it slide right through the `~` sibling selector, and a gradient progress bar fills from 0 to 100%. All of it is pure CSS.
