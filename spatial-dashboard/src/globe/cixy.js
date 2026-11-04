// Cixy panel: avatar, greeting, quick prompts, chat log, compose box. Talks to /api/cixy (server-side
// Anthropic; the key never reaches the browser). Same persona and route as before, new skin.
import { authHeader } from "../authClient.js";

const CHIPS = ["Where is my fleet right now?", "Show active aircraft", "Any alerts today?", "Summarize today's activity"];

export function mountCixy(root, { store, onShowAircraft } = {}) {
  root.innerHTML = `
    <div class="panel cixy" data-cixy>
      <div class="panel-head">
        <span class="panel-title"><img src="/brand/mark.png" alt="" width="18" height="18" style="width:18px;height:18px;object-fit:contain" />Cixy AI Assistant</span>
        <span class="chip chip-beta" style="margin-left:auto">BETA</span>
        <span class="dot" data-cixy-dot style="background:var(--dim)" title="Cixy state"></span>
      </div>
      <div class="panel-body" style="display:grid;gap:10px;min-height:0;flex:1">
        <div class="head-row">
          <div class="avatar"><img src="/cixy/cixy-geoxis-avatar.webp" alt="Cixy" data-avatar /></div>
          <div class="bubble">Hi! I'm <b>Cixy</b> 👋<br>Ask me anything about your fleet, assets, routes, or global operations.</div>
        </div>
        <div class="chips">${CHIPS.map((c) => `<button type="button" data-chip>${c}</button>`).join("")}</div>
        <div class="log scroll" role="log" aria-live="polite" data-log></div>
        <form class="compose" data-compose>
          <textarea class="field" rows="1" placeholder="Ask Cixy anything…" aria-label="Ask Cixy" data-input></textarea>
          <button class="send" type="submit" aria-label="Send" disabled data-send><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
        </form>
      </div>
    </div>`;

  const panel = root.querySelector("[data-cixy]");
  const avatar = root.querySelector("[data-avatar]");
  avatar.addEventListener("error", () => { avatar.src = "/brand/mark.png"; avatar.classList.add("mark"); }, { once: true });
  const log = root.querySelector("[data-log]");
  const input = root.querySelector("[data-input]");
  const send = root.querySelector("[data-send]");
  const dot = root.querySelector("[data-cixy-dot]");
  const history = [];
  let busy = false;

  const append = (role, text) => {
    const el = document.createElement("div");
    el.className = `msg msg-${role}`;
    el.textContent = text;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  const setState = (s) => { dot.style.background = s === "busy" ? "var(--primary)" : s === "error" ? "var(--red)" : "var(--live)"; };

  async function ask(text) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    busy = true;
    setState("busy");
    append("user", clean);
    history.push({ role: "user", content: clean });
    input.value = "";
    send.disabled = true;
    const thinking = append("assistant", "…");
    if (/show (active|live) aircraft|aircraft/i.test(clean) && onShowAircraft) onShowAircraft();
    try {
      const res = await fetch("/api/cixy", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ messages: history.slice(-20) }) });
      const data = await res.json().catch(() => ({}));
      let reply;
      if (res.status === 503) reply = data.message || "Cixy is not connected yet on the server, so I will not fake an answer.";
      else if (!res.ok) reply = data.message || data.reply || data.error || "Cixy could not answer right now.";
      else reply = data.text || "No answer returned.";
      thinking.textContent = reply;
      history.push({ role: "assistant", content: reply });
      setState(res.ok ? "ok" : "error");
    } catch {
      thinking.textContent = "Cixy could not reach the server right now.";
      setState("error");
    } finally {
      busy = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  root.querySelector("[data-compose]").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 110)}px`; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  for (const b of root.querySelectorAll("[data-chip]")) b.addEventListener("click", () => ask(b.textContent));
  setState("ok");

  return {
    setCompact(on) { panel.classList.toggle("compact", on); },
    focus() { input.focus(); input.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
    ask,
  };
}
