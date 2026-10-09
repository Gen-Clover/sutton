// WhatsApp widget: a simulated WhatsApp Business conversation (demo data).
// In production this is wired to the WhatsApp Business Platform (Cloud API):
// greeting + quick-reply templates, with messages landing in the team inbox.
import { closeOtherPanels } from "./assistant.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const QUICK = ["Book a consultation 📅", "Veneers pricing 💎", "Your address 📍", "Send smile photos 📸"];
const REPLIES = [
  { re: /book|consult|appointment/i, text: "We'd love to see you! 😊 Please reply with your *name* and a *preferred day/time*, and our coordinator will confirm your complimentary consultation." },
  { re: /price|pricing|cost|veneer/i, text: "Every smile is custom, so the doctor gives you an exact quote at your *free consultation*. Want us to send a few available times?" },
  { re: /address|where|location/i, text: "📍 400 East 56th St, Suite 1\nNew York, NY 10022\n\nhttps://goo.gl/maps/wLiBGAr7Ti8naWBS8" },
  { re: /photo|picture|selfie/i, text: "Absolutely! Send a smiling front photo and a close-up of your teeth 📸 and Dr. Fajiram will share first thoughts before your visit." },
  { re: /insurance/i, text: "We don't accept insurance directly, but we can provide all the paperwork for out-of-network reimbursement 🙂" },
];

let body, input, panel, quickEl, started = false;

function bubble(text, dir) {
  const el = document.createElement("div");
  el.className = `wa-msg ${dir}`;
  el.innerHTML = `${esc(text).replace(/\*(.+?)\*/g, "<b>$1</b>")}<time>${now()}</time>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}
async function reply(text) {
  const status = $(".wa-head span", panel);
  status.textContent = "typing…";
  await wait(900 + Math.random() * 700);
  status.textContent = "online";
  bubble(text, "in");
  setTimeout(() => (status.textContent = "Typically replies within minutes"), 4000);
}
async function send(text) {
  text = text.trim();
  if (!text) return;
  bubble(text, "out");
  const r = REPLIES.find((x) => x.re.test(text));
  await reply(r ? r.text : "Thanks for your message! 🙏 A member of our team will reply here shortly. For anything urgent, call 212-751-5665.");
}

function start() {
  if (started) return;
  started = true;
  body.innerHTML = `<div class="wa-day">TODAY</div><div class="wa-day">🔒 Demo preview: replies are simulated</div>`;
  setTimeout(() => bubble("Hi there 👋 Welcome to *Sutton Advanced Cosmetic Dentistry*.\nHow can we help you today?", "in"), 350);
}

export function initWhatsApp() {
  panel = $("#waPanel"); body = $("#waBody"); input = $("#waText"); quickEl = $("#waQuick");
  quickEl.innerHTML = QUICK.map((q) => `<button type="button">${q}</button>`).join("");

  $("#waFab").addEventListener("click", () => {
    const opening = panel.hidden;
    closeOtherPanels("waPanel");
    panel.hidden = !opening;
    if (opening) { start(); setTimeout(() => input.focus({ preventScroll: true }), 300); }
  });
  panel.querySelector("[data-close-panel]").addEventListener("click", () => (panel.hidden = true));
  quickEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  $("#waForm").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; send(v); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.hidden = true; });
}
