// "Ava" — AI concierge.
// Works fully offline with a local intent engine built from practice.json.
// If the server reports a Claude key (/api/status → assistant: "claude"),
// free-text questions are answered by Claude instead; guided flows (booking)
// always stay local so leads are captured reliably.

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// minimal markdown: **bold**, [text](url), bullet lines, paragraphs
const md = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\(((?:https?:|tel:|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`)
    .split(/\n{2,}/)
    .map((block) => {
      // group consecutive "- " lines into a list; other lines become a paragraph
      let html = "", text = [], items = [];
      const flushText = () => { if (text.length) html += `<p>${text.join("<br>")}</p>`; text = []; };
      const flushList = () => { if (items.length) html += `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`; items = []; };
      for (const l of block.split("\n")) {
        if (/^\s*[-•]\s+/.test(l)) { flushText(); items.push(l.replace(/^\s*[-•]\s+/, "")); }
        else { flushList(); text.push(l); }
      }
      flushText(); flushList();
      return html;
    })
    .join("");

let P, SERVICES, body, chipsEl, input, panel, fab;
let mode = "local";
let history = []; // for Claude: [{role, content}]
let flow = null;  // active guided flow
let greeted = false;

const SYN = {
  "Porcelain Veneers": ["veneer", "veneers", "lumineers", "porcelain"],
  "Smile Makeover": ["makeover", "smile design", "hollywood smile", "celebrity smile", "transform"],
  "Dental Implants": ["implant", "implants", "missing tooth", "missing teeth", "lost a tooth"],
  "All-on-X / All-on-6": ["all on", "all-on", "full arch", "dentures", "denture"],
  "Laser Teeth Whitening": ["whiten", "whitening", "bleach", "yellow", "stain", "brighter"],
  "Invisalign": ["invisalign", "aligner", "braces", "straighten", "crooked"],
  "Porcelain Crowns": ["crown", "crowns", "cap"],
  "One-Visit Dentistry (CEREC)": ["cerec", "one-visit", "same day", "same-day", "one visit", "single visit", "one day"],
  "Teeth Bonding": ["bonding", "chip", "chipped"],
  "Inlays & Onlays": ["inlay", "onlay"],
  "Dental Bridges": ["bridge"],
  "Full Mouth Reconstruction": ["reconstruction", "full mouth", "rebuild"],
  "TMJ Treatment": ["tmj", "jaw", "clench", "grind"],
  "Sleep Apnea Screening": ["sleep apnea", "snore", "snoring"],
  "Professional Cleanings": ["cleaning", "hygiene", "checkup", "check-up", "check up"],
  "Pain-Free Dentistry": ["sedation", "nitrous", "laughing gas"],
};

const INTENTS = [
  { id: "book", re: /\b(book|appointment|schedule|consult|reserve|come in|see (the )?(doctor|dentist)|available|availability)\b/ },
  { id: "emergency", re: /\b(emergency|urgent|broken|knocked|swollen|swelling|bleeding|severe pain|toothache|abscess)\b/ },
  { id: "price", re: /\b(price|prices|cost|costs|how much|pricing|fee|fees|expensive|afford|payment|finance|financing|\$)/ },
  { id: "insurance", re: /\b(insurance|insured|delta|cigna|aetna|metlife|guardian|out.of.network|ppo|hsa|fsa)\b/ },
  { id: "location", re: /\b(where|address|location|located|directions|parking|subway|train|map|find you)\b/ },
  { id: "hours", re: /\b(hours|open|close|closing|weekend|saturday|sunday|today|tonight|after hours)\b/ },
  { id: "doctors", re: /\b(doctor|doctors|dentist|dr\.?|fajiram|monahemi|sheila|mojgan|who (will|is))\b/ },
  { id: "celeb", re: /\b(celeb|celebrity|celebrities|famous|nicki|fat joe|idris|shania|star)\b/ },
  { id: "anxiety", re: /\b(scared|afraid|anxious|anxiety|nervous|fear|phobia|pain|hurt|painful|comfortable)\b/ },
  { id: "travel", re: /\b(out of state|travel|airport|fly|flying|jfk|laguardia|newark|hotel|international)\b/ },
  { id: "reviews", re: /\b(review|reviews|rating|rated|testimonial|google)\b/ },
  { id: "results", re: /\b(before|after|gallery|results|photos|pictures|examples)\b/ },
  { id: "services", re: /\b(services|treatments|what do you (do|offer)|offer|procedures|menu)\b/ },
  { id: "duration", re: /\b(how long|last|lasting|longevity|durable|years)\b/ },
  { id: "contact", re: /\b(phone|call|number|email|contact|whatsapp|text you|human|person|someone|receptionist)\b/ },
  { id: "thanks", re: /\b(thank|thanks|thx|appreciate|great|perfect|awesome)\b/ },
  { id: "hello", re: /^(hi|hey|hello|hola|good (morning|afternoon|evening)|yo)\b/ },
];

const DEFAULT_CHIPS = ["Book a free consultation", "Veneers", "Pricing", "Insurance", "Where are you?", "Are you open now?"];

/* ---------------- rendering ---------------- */
function scroll() { body.scrollTop = body.scrollHeight; }
function addMsg(text, who = "bot") {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.innerHTML = who === "bot" ? md(text) : esc(text);
  body.appendChild(el);
  scroll();
  return el;
}
function addCards(items) {
  const wrap = document.createElement("div");
  wrap.className = "cards";
  wrap.innerHTML = items.map((s) => `<button class="card" data-ask="Tell me about ${esc(s.name)}"><img src="${s.img}" alt="" loading="lazy"><span>${esc(s.short || s.name)}</span></button>`).join("");
  body.appendChild(wrap);
  scroll();
}
function setChips(chips = DEFAULT_CHIPS) {
  chipsEl.innerHTML = chips.map((c) => `<button type="button">${esc(c)}</button>`).join("");
}
function typing() {
  const el = document.createElement("div");
  el.className = "msg bot typing";
  el.innerHTML = "<i></i><i></i><i></i>";
  body.appendChild(el);
  scroll();
  return el;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function botSay(text, { chips, cards, delay } = {}) {
  const t = typing();
  await wait(delay ?? Math.min(1400, 420 + text.length * 6));
  t.remove();
  addMsg(text);
  history.push({ role: "assistant", content: text });
  if (cards) addCards(cards);
  if (chips !== undefined) setChips(chips);
}

/* ---------------- NYC office-hours awareness ---------------- */
function nycNow() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "weekday").value;
  const hour = +parts.find((p) => p.type === "hour").value;
  return { day, hour, office: !["Sat", "Sun"].includes(day) && hour >= 9 && hour < 18 };
}

/* ---------------- local intent engine ---------------- */
function findService(q) {
  for (const [name, words] of Object.entries(SYN)) if (words.some((w) => q.includes(w))) return P.services.find((s) => s.name === name);
  return P.services.find((s) => q.includes(s.name.toLowerCase()));
}

function localAnswer(raw) {
  const q = raw.toLowerCase();
  const svc = findService(q);
  const hit = INTENTS.find((i) => i.re.test(q))?.id;

  if (hit === "book") return startBooking(svc?.name);
  if (hit === "emergency") return botSay(`I'm sorry you're dealing with that. For anything urgent, please **call us right away at [212-751-5665](tel:2127515665)** so the team can see you as soon as possible.\n\nIf you have severe swelling, trouble breathing or uncontrolled bleeding, please go to the nearest ER or call 911.`, { chips: ["Call the office", "Book a visit"] });
  if (hit === "price") return botSay(`Every smile is custom, so fees depend on your plan (for example, how many veneers or implants you need). Your **consultation is complimentary**, and you'll leave it with an exact, written quote.${svc ? `\n\nFor **${svc.name}**, Dr. Fajiram will walk you through the options and timing at that visit.` : ""}\n\nWould you like me to reserve a free consultation?`, { chips: ["Yes, book me in", "Do you take insurance?", "Financing?"] });
  if (hit === "insurance") return botSay(`We're a fee-for-service practice and **don't accept dental insurance** directly. Many patients still submit their receipts to their insurer for out-of-network reimbursement, and our team is happy to provide the paperwork you need.`, { chips: ["How much does it cost?", "Book a free consultation"] });
  if (hit === "location") return botSay(`We're at **400 East 56th St, Suite 1, New York, NY 10022**, in Sutton Place / Midtown East, minutes from the Upper East Side.\n\n[Open in Google Maps](${P.mapsUrl})`, { chips: ["Coming from out of state", "Book a visit", "Are you open now?"] });
  if (hit === "hours") {
    const n = nycNow();
    return botSay(`${n.office ? "Our team is in the office right now, so you can call [212-751-5665](tel:2127515665) for an instant answer." : "The office is closed at the moment, but I'm here 24/7 and can take your details so a coordinator calls you first thing."}\n\nWe see patients **by appointment**, and the coordinator confirms exact times when you book.`, { chips: ["Book a free consultation", "Request a call back"] });
  }
  if (hit === "doctors" && !svc) return botSay(`You'd be in wonderful hands:\n- **Dr. Mojgan Fajiram, DDS**: founder, 30+ years in cosmetic dentistry, RealSelf Top Doctor and the go-to for celebrity smiles.\n- **Dr. Sheila Monahemi, DDS**: general & cosmetic dentist known for beautifully natural veneers.`, { chips: ["Veneers", "See before & after", "Book with Dr. Fajiram"] });
  if (hit === "celeb") return botSay(`Our patients have included **${P.celebrities.slice(0, 8).join(", ")}** and many more. Every patient gets the same red-carpet care, and full discretion.`, { chips: ["See before & after", "Smile makeover", "Book a consultation"] });
  if (hit === "anxiety" && !svc) return botSay(`You're not alone, and many of our patients felt the same. We use **pain-free techniques**, take things at your pace and offer comfort options. The office is calm and spa-like, so even nervous patients tell us they look forward to visits.`, { chips: ["Sedation options", "Book a gentle consult"] });
  if (hit === "travel") return botSay(`We welcome patients from all over. From LaGuardia it's about **15 min** by car, and about **30 min** from JFK or Newark. Thanks to our **on-site lab**, many treatments can be completed in very few visits, which is ideal if you're flying in.`, { chips: ["One-visit dentistry", "Book a consultation"] });
  if (hit === "reviews") return botSay(`We're rated **4.9★ from about 236 Google reviews**. One patient wrote: *“My dentist for life. I would literally never go anywhere else.”*`, { chips: ["See reviews", "Book a consultation"] });
  if (hit === "results") { document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }); return botSay(`I've scrolled you to our **before & after** gallery. Drag the slider to compare real patients.`, { chips: ["Veneers", "Smile makeover", "Book a consultation"] }); }
  if (svc) {
    const extra = hit === "duration" && /veneer/.test(svc.name.toLowerCase()) ? "\n\nWith good care (regular cleanings, and a night guard if you grind), porcelain veneers commonly last **10–15+ years**." : "";
    return botSay(`**${svc.name}**: ${svc.summary}${extra}\n\nThe first step is a complimentary consultation, where the doctor designs the plan around your face and goals.`, { chips: ["How much does it cost?", `Book for ${svc.name}`, "See before & after"] });
  }
  if (hit === "services") return botSay(`Here are our most-requested treatments. Tap one to learn more:`, { cards: SERVICES, chips: ["All-on-X", "TMJ", "Sleep apnea", "Cleanings"] });
  if (hit === "contact") return botSay(`You can reach the team at **[212-751-5665](tel:2127515665)**, or message us on WhatsApp using the green button. I can also have a coordinator call you back.`, { chips: ["Request a call back", "Book a consultation"] });
  if (hit === "thanks") return botSay(`My pleasure! Is there anything else I can help you with?`, { chips: DEFAULT_CHIPS });
  if (hit === "hello") return botSay(`Hello! 😊 How can I help you today?`, { chips: DEFAULT_CHIPS });
  return botSay(`That's a great question for the doctor. I'd love to get you an exact answer. I can have a care coordinator **call you back**, or you can book a **free consultation** right here.`, { chips: ["Request a call back", "Book a free consultation", "See services"] });
}

/* ---------------- booking flow (always local) ---------------- */
const TIMES = ["Weekday morning", "Weekday afternoon", "Early evening", "First available"];
function startBooking(service, callback = false) {
  flow = { step: "name", data: { service: service || "", callback } };
  return botSay(callback
    ? `Of course. A coordinator will call you back. What's your **name**?`
    : `Wonderful, let's reserve your **complimentary consultation**${service ? ` for **${service}**` : ""}. It takes 30 seconds.\n\nFirst, what's your **full name**?`, { chips: ["Cancel"] });
}
async function handleFlow(text) {
  const d = flow.data;
  if (/^cancel$/i.test(text.trim())) { flow = null; return botSay(`No problem, I've cancelled that. What else can I help with?`, { chips: DEFAULT_CHIPS }); }
  switch (flow.step) {
    case "name":
      if (text.trim().length < 2) return botSay(`Could you share your name?`);
      d.name = text.trim().replace(/^(my name is|i'm|i am|it's)\s+/i, "");
      flow.step = "phone";
      return botSay(`Lovely to meet you, ${d.name.split(" ")[0]}! What's the best **phone number** to reach you?`, { chips: ["Cancel"] });
    case "phone":
      if (text.replace(/\D/g, "").length < 7) return botSay(`Hmm, that doesn't look like a phone number. Could you double-check it?`);
      d.phone = text.trim();
      if (d.callback) return finishBooking();
      if (d.service) { flow.step = "time"; return botSay(`When works best for you?`, { chips: TIMES }); }
      flow.step = "service";
      return botSay(`Which treatment are you most interested in?`, { chips: ["Porcelain Veneers", "Smile Makeover", "Dental Implants", "Whitening", "Invisalign", "Not sure yet"] });
    case "service":
      d.service = findService(text.toLowerCase())?.name || text.trim();
      flow.step = "time";
      return botSay(`Great choice. When works best for you?`, { chips: TIMES });
    case "time":
      d.time = text.trim();
      return finishBooking();
  }
}
async function finishBooking() {
  const d = flow.data;
  flow = null;
  setChips([]);
  try {
    await fetch("/api/lead", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: d.callback ? "AI concierge · call back" : "AI concierge · booking", name: d.name, phone: d.phone, service: d.service, message: d.time ? `Preferred time: ${d.time}` : "Call-back request" }),
    });
  } catch {}
  const n = nycNow();
  return botSay(
    d.callback
      ? `Done ✅ ${d.name.split(" ")[0]}, a coordinator will call **${d.phone}** ${n.office ? "shortly" : "first thing during office hours"}.`
      : `You're all set ✅\n- **Name:** ${d.name}\n- **Phone:** ${d.phone}\n- **Interested in:** ${d.service}\n- **Preferred:** ${d.time}\n\nA care coordinator will call you ${n.office ? "shortly" : "first thing during office hours"} to confirm your complimentary consultation.`,
    { chips: ["Where are you located?", "Do you take insurance?", "Thanks!"], delay: 1200 }
  );
}

/* ---------------- Claude (server) ---------------- */
async function claudeAnswer(text) {
  const t = typing();
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }) });
    const d = await r.json();
    t.remove();
    if (!r.ok || !d.reply) throw new Error("local");
    addMsg(d.reply);
    history.push({ role: "assistant", content: d.reply });
    setChips(["Book a free consultation", "Request a call back"]);
  } catch {
    t.remove();
    await localAnswer(text);
  }
}

/* ---------------- input routing ---------------- */
async function handle(text) {
  text = text.trim();
  if (!text) return;
  addMsg(text, "user");
  history.push({ role: "user", content: text });
  setChips([]);
  const q = text.toLowerCase();
  if (flow) return handleFlow(text);
  // chip shortcuts that should always run a guided flow
  if (/request a call ?back|call me/.test(q)) return startBooking("", true);
  if (/^call the office$/.test(q)) { location.href = "tel:2127515665"; return botSay("Calling 212-751-5665…", { chips: DEFAULT_CHIPS }); }
  if (/^(see reviews)$/.test(q)) { document.querySelector("#reviews")?.scrollIntoView({ behavior: "smooth" }); return botSay("Here are our latest Google reviews ⭐", { chips: DEFAULT_CHIPS }); }
  if (/^see services$/.test(q)) return localAnswer("services");
  if (/^(yes,? book me in|book .*|book a .*)$/.test(q)) {
    const m = text.match(/^book for (.+)$/i);
    return startBooking(m ? m[1] : findService(q)?.name);
  }
  if (mode === "claude") return claudeAnswer(text);
  return localAnswer(text);
}

/* ---------------- public API ---------------- */
function greet() {
  if (greeted) return;
  greeted = true;
  const n = nycNow();
  botSay(`Hi, I'm **Ava**, the virtual concierge for Sutton Advanced Cosmetic Dentistry ✨\n\n${n.office ? "I can answer questions instantly, or book your free consultation." : "Our office is closed right now, but I'm available 24/7. I can answer questions or book your free consultation."}`, { chips: DEFAULT_CHIPS, delay: 600 });
}

export function openAssistant(prefill) {
  closeOtherPanels("aiPanel");
  panel.hidden = false;
  fab.classList.add("open", "seen");
  $("#fabHint").classList.remove("show");
  greet();
  if (prefill) setTimeout(() => handle(prefill), greeted ? 900 : 0);
  else setTimeout(() => input.focus({ preventScroll: true }), 300);
}
function closeAssistant() {
  panel.hidden = true;
  fab.classList.remove("open");
}
export function closeOtherPanels(keepId) {
  document.querySelectorAll(".panel").forEach((p) => { if (p.id !== keepId) p.hidden = true; });
  if (keepId !== "aiPanel") $("#aiFab").classList.remove("open");
}

export function initAssistant(practice, services) {
  P = practice; SERVICES = services;
  panel = $("#aiPanel"); body = $("#aiBody"); chipsEl = $("#aiChips"); input = $("#aiText"); fab = $("#aiFab");

  fab.addEventListener("click", () => (panel.hidden ? openAssistant() : closeAssistant()));
  panel.querySelector("[data-close-panel]").addEventListener("click", closeAssistant);
  $("#aiForm").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; handle(v); });
  chipsEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) handle(b.textContent); });
  body.addEventListener("click", (e) => { const c = e.target.closest("[data-ask]"); if (c) handle(c.dataset.ask); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) closeAssistant(); });

  // after-hours aware nudge
  setTimeout(() => { if (panel.hidden && !fab.classList.contains("seen")) $("#fabHint").classList.add("show"); }, 3500);
  setTimeout(() => $("#fabHint").classList.remove("show"), 12000);

  fetch("/api/status").then((r) => r.json()).then((s) => {
    mode = s.assistant === "claude" ? "claude" : "local";
    $("#aiMode").textContent = mode === "claude" ? "powered by Claude · 24/7" : "online 24/7";
  }).catch(() => {});
}
