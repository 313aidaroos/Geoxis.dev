/**
 * uiController.js — DOM binding layer.
 *
 * Subscribes to the event bus and reflects state into the sidebar, metrics
 * bar, selected-asset card, AI panel, and settings modal. All DOM writes
 * live here; other modules never touch the document (except the map's
 * status line, which it owns).
 */

import { ASSET_STYLES } from "./mapController.js";
import { SettingsManager } from "./main.js";

const $ = (id) => document.getElementById(id);

export class UIController {
  /** @param {import("./main.js").B2BSaasEngine} engine */
  constructor(engine) {
    this.engine = engine;
    this.bus = engine.bus;
    this.state = engine.state;
    this.settings = engine.settings;

    this.rows = new Map(); // asset id -> <li>
    this.searchTerm = "";
    this.assistantDeltaEl = null;
    this.#listDirty = false;
  }

  #listDirty;

  mount() {
    this.#bindSidebar();
    this.#bindMetrics();
    this.#bindSelection();
    this.#bindAiPanel();
    this.#bindSettings();
    this.#syncLayerToggles();
    // Batch list DOM updates to one paint per frame regardless of feed rate.
    const loop = () => {
      if (this.#listDirty) { this.#listDirty = false; this.#sortList(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- */
  /*  Sidebar                                                          */
  /* ---------------------------------------------------------------- */

  #bindSidebar() {
    $("assetSearch").addEventListener("input", (e) => {
      this.searchTerm = e.target.value.trim().toLowerCase();
      this.#applyFilter();
    });

    for (const input of document.querySelectorAll("input.toggle")) {
      input.addEventListener("change", () => this.state.setLayer(input.dataset.layer, input.checked));
    }
    this.bus.on("ui:syncLayers", () => this.#syncLayerToggles());
    this.bus.on("layer:changed", () => this.#syncLayerToggles());

    this.bus.on("asset:updated", (a) => this.#upsertRow(a));
    this.bus.on("asset:removed", (id) => {
      this.rows.get(id)?.remove();
      this.rows.delete(id);
      this.#updateCount();
    });

    this.bus.on("stream:meta", () => this.#updateCount());
    this.bus.on("feed:status", ({ connected, text, messagesPerSecond }) => {
      $("feedDot").className = `w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-slate-500"}`;
      if (text) $("feedStatus").textContent = text;
      if (typeof messagesPerSecond === "number") $("feedRate").textContent = `${messagesPerSecond} msg/s`;
    });

    this.bus.on("map:layerError", ({ name }) => {
      this.toast(`The ${name} layer couldn't be loaded right now.`, "error");
      this.state.setLayer(name, false);
    });
  }

  #syncLayerToggles() {
    for (const input of document.querySelectorAll("input.toggle")) {
      input.checked = Boolean(this.state.layers[input.dataset.layer]);
    }
  }

  #upsertRow(a) {
    let li = this.rows.get(a.id);
    const style = ASSET_STYLES[a.type] ?? ASSET_STYLES.default;
    const speed = a.type === "vessel" ? `${a.speedKnots} kn` : `${a.speedKph} km/h`;

    if (!li) {
      li = document.createElement("li");
      li.className = "asset-row";
      li.setAttribute("role", "option");
      li.tabIndex = 0;
      li.dataset.id = a.id;
      li.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full" style="background:${style.color}"></span>
        <span class="min-w-0">
          <span class="name truncate block"></span>
          <span class="sub truncate block"></span>
        </span>
        <span class="stat"><b class="speed"></b><span class="hdg"></span></span>`;
      const select = () => {
        const prev = this.state.selectedAssetId;
        this.state.selectAsset(a.id);
        if (prev) this.engine.map.refreshAssetStyle(prev);
        this.engine.map.refreshAssetStyle(a.id);
        this.engine.map.flyToAsset(a.latitude, a.longitude, 3000);
      };
      li.addEventListener("click", select);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
      this.rows.set(a.id, li);
      $("assetList").appendChild(li);
      $("assetListEmpty").classList.add("hidden");
      this.#applyFilter();
    }

    li.querySelector(".name").textContent = a.name;
    li.querySelector(".sub").textContent = [a.callsign || a.registration || a.imo || a.mmsi || a.id, a.destination].filter(Boolean).join(" · ");
    li.querySelector(".speed").textContent = speed;
    li.querySelector(".hdg").textContent = `${Math.round(a.heading)}°`;
    li.dataset.alarm = a.alarm ? "true" : "false";
    li.setAttribute("aria-selected", this.state.selectedAssetId === a.id ? "true" : "false");
    li.title = a.alarm ? a.alarmReason : "";
    this.#listDirty = true;
    this.#updateCount();
  }

  #sortList() {
    // Alarms first, then alphabetical; stable enough that rows don't jump.
    const list = $("assetList");
    const sorted = [...this.rows.values()].sort((x, y) => {
      const ax = x.dataset.alarm === "true", ay = y.dataset.alarm === "true";
      if (ax !== ay) return ax ? -1 : 1;
      return x.querySelector(".name").textContent.localeCompare(y.querySelector(".name").textContent);
    });
    sorted.forEach((li, i) => { if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null); });
  }

  #applyFilter() {
    for (const [id, li] of this.rows) {
      const a = this.state.assets.get(id);
      const hay = [a?.name,id,a?.destination,a?.operator,a?.callsign,a?.registration,a?.imo,a?.mmsi,a?.vehicleId].filter(Boolean).join(" ").toLowerCase();
      li.classList.toggle("hidden", Boolean(this.searchTerm) && !hay.includes(this.searchTerm));
    }
  }

  #updateCount() {
    $("assetCount").textContent = this.state.dataMode === "demo" ? "Demo" : String(this.state.assets.size);
  }

  /* ---------------------------------------------------------------- */
  /*  Metrics bar                                                      */
  /* ---------------------------------------------------------------- */

  #bindMetrics() {
    this.bus.on("metrics:changed", ({ totalAssets, latencyMs, activeAlarms }) => {
      $("mTotalAssets").textContent = totalAssets == null ? "—" : String(totalAssets);
      $("mLatency").textContent = latencyMs === null ? "—" : String(Math.round(latencyMs));
      const alarmsEl = $("mAlarms");
      alarmsEl.textContent = activeAlarms == null ? "—" : String(activeAlarms);
      alarmsEl.classList.toggle("alarm", activeAlarms != null && activeAlarms > 0);
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Selected asset card                                              */
  /* ---------------------------------------------------------------- */

  #bindSelection() {
    const card = $("selectedCard");

    this.bus.on("asset:selected", (a) => {
      for (const [id, li] of this.rows) li.setAttribute("aria-selected", a?.id === id ? "true" : "false");
      if (!a) { card.classList.add("hidden"); return; }
      this.#renderSelected(a);
      card.classList.remove("hidden");
    });

    // Keep the card live while the asset moves.
    this.bus.on("asset:updated", (a) => {
      if (a.id === this.state.selectedAssetId) this.#renderSelected(a);
    });

    $("btnCloseSelected").addEventListener("click", () => {
      const prev = this.state.selectedAssetId;
      this.state.selectAsset(null);
      this.engine.map.trackAsset(null);
      if (prev) this.engine.map.refreshAssetStyle(prev);
    });

    $("btnFollow").addEventListener("click", () => {
      const id = this.state.selectedAssetId;
      if (!id) return;
      const following = this.state.followingAssetId === id;
      this.state.setFollowing(following ? null : id);
      this.engine.map.trackAsset(following ? null : id);
      $("btnFollow").textContent = following ? "Follow asset" : "Stop following";
    });
    this.bus.on("asset:following", (id) => {
      $("btnFollow").textContent = id ? "Stop following" : "Follow asset";
    });
  }

  #renderSelected(a) {
    const style = ASSET_STYLES[a.type] ?? ASSET_STYLES.default;
    const value = (v) => v === null || v === undefined || v === "" ? "Unavailable" : String(v);
    const number = (v, digits = 0) => Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v).toFixed(digits) : "Unavailable";
    $("selType").style.background = style.color;
    $("selName").textContent = value(a.name || a.callsign || a.id);
    $("selId").textContent = [a.id, style.label, a.operator].filter(Boolean).join(" · ");
    const identity = a.type === "aircraft"
      ? [["Flight", a.flightNumber], ["Callsign", a.callsign], ["Registration", a.registration], ["Aircraft model", a.model || a.aircraftType], ["Altitude", a.altitudeMeters == null ? null : number(a.altitudeMeters) + " m"]]
      : a.type === "vessel"
        ? [["IMO", a.imo], ["MMSI", a.mmsi], ["Flag", a.flag], ["Vessel class", a.vesselType]]
        : a.type === "truck"
          ? [["Vehicle ID", a.vehicleId || a.id], ["Fleet", a.operator], ["Truck model", a.model], ["Registration", a.registration]]
          : [];
    const rows = [
      ...identity,
      ["Speed", a.type === "vessel" ? (a.speedKnots == null ? null : number(a.speedKnots, 1) + " kn") : (a.speedKph == null ? null : number(a.speedKph, 1) + " km/h")],
      ["Heading", a.heading == null ? null : number(a.heading) + "°"],
      ["Position", Number.isFinite(a.latitude) && Number.isFinite(a.longitude) ? a.latitude.toFixed(4) + ", " + a.longitude.toFixed(4) : null],
      ["Destination", a.destination],
      ["Cargo", a.cargo],
      ["Distance run", a.odometerKm == null ? null : number(a.odometerKm, 1) + " km"],
      ["Status", a.alarm ? a.alarmReason : a.status],
      ["Source", a.source || a.provider],
      ["Last fix", a.timestamp && !Number.isNaN(Date.parse(a.timestamp)) ? new Date(a.timestamp).toLocaleString() : null],
    ];
    const meta = $("selMeta");
    meta.replaceChildren();
    for (const [key, raw] of rows) {
      const dt = document.createElement("dt");
      dt.className = "text-slate-400";
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.className = "text-slate-100 text-right tabular";
      dd.textContent = value(raw);
      meta.append(dt, dd);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  AI panel                                                         */
  /* ---------------------------------------------------------------- */

  #bindAiPanel() {
    const panel = $("aiPanel");
    const input = $("chatInput");
    const send = $("btnSend");
    const mic = $("btnMic");

    const open = () => {
      panel.classList.add("open");
      $("btnAiToggle").setAttribute("aria-expanded", "true");
      $("btnAiToggle").classList.add("hidden");
      this.engine.ai?.connect();
      input.focus();
    };
    const close = () => {
      panel.classList.remove("open");
      $("btnAiToggle").setAttribute("aria-expanded", "false");
      $("btnAiToggle").classList.remove("hidden");
    };
    $("btnAiToggle").addEventListener("click", open);
    $("btnAiClose").addEventListener("click", close);

    const submit = () => {
      const text = input.value;
      if (!text.trim()) return;
      if (this.engine.ai.sendText(text)) {
        input.value = "";
        input.style.height = "";
      }
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
      send.disabled = !input.value.trim();
    });
    send.disabled = true;

    // Push-to-talk: hold mouse/touch/space on the mic button.
    const start = (e) => { e.preventDefault(); this.engine.ai.startListening(); };
    const stop = () => this.engine.ai.stopListening({ submit: true });
    mic.addEventListener("mousedown", start);
    mic.addEventListener("touchstart", start, { passive: false });
    mic.addEventListener("mouseup", stop);
    mic.addEventListener("mouseleave", () => { if (this.engine.ai.status === "listening") stop(); });
    mic.addEventListener("touchend", stop);
    mic.addEventListener("keydown", (e) => { if (e.key === " " && !e.repeat) start(e); });
    mic.addEventListener("keyup", (e) => { if (e.key === " ") stop(); });

    this.bus.on("ai:status", (status) => {
      $("aiPulse").dataset.state = status;
      $("aiState").textContent = {
        offline: "Offline", connecting: "Connecting…", connected: "Ready",
        listening: "Listening", streaming: "Responding", error: "Connection error",
      }[status] ?? status;
      mic.setAttribute("aria-pressed", status === "listening" ? "true" : "false");
      $("aiLauncherDot").className = `w-2 h-2 rounded-full ${status === "connected" || status === "streaming" ? "bg-emerald-400" : status === "error" ? "bg-red-400" : "bg-slate-500"}`;
    });

    this.bus.on("ai:delta", ({ text }) => {
      if (!this.assistantDeltaEl) {
        this.assistantDeltaEl = this.#appendMessage("assistant", "");
      }
      this.assistantDeltaEl.textContent = text;
      this.#scrollChat();
    });

    this.bus.on("ai:message", ({ role, text }) => {
      if (role === "assistant" && this.assistantDeltaEl) {
        this.assistantDeltaEl.textContent = text;
        this.assistantDeltaEl = null;
      } else {
        this.#appendMessage(role, text);
      }
      this.#scrollChat();
    });
  }

  #appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `msg msg-${role}`;
    el.textContent = text;
    $("chatLog").appendChild(el);
    return el;
  }

  #scrollChat() {
    const log = $("chatLog");
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------------------------------------------------------- */
  /*  Settings modal                                                   */
  /* ---------------------------------------------------------------- */

  #bindSettings() {
    const modal = $("settingsModal");
    const form = $("settingsForm");
    const gInput = $("keyGoogle");

    const open = () => {
      const s = this.settings.getAll();
      gInput.value = s.googleMapsKey;
      gInput.placeholder = s.googleMapsKey ? SettingsManager.mask(s.googleMapsKey) : "AIza…";
      this.#clearFieldErrors();
      modal.classList.remove("hidden");
      gInput.focus();
    };
    const close = () => modal.classList.add("hidden");

    $("btnSettings").addEventListener("click", open);
    $("btnSettingsCancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) close(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.#clearFieldErrors();
      const result = this.settings.saveKeys({ googleMapsKey: gInput.value });
      if (!result.ok) {
        for (const [, message] of Object.entries(result.errors)) {
          const inputId = "keyGoogle";
          $(inputId).classList.add("invalid");
          const err = form.querySelector(`.field-error[data-for="${inputId}"]`);
          err.textContent = message;
          err.classList.add("visible");
        }
        return;
      }
      close();
      this.toast("Keys saved.");
      await this.engine.applySettings();
    });

    $("btnClearKeys").addEventListener("click", async () => {
      this.settings.clearKeys();
      gInput.value = "";
      close();
      this.toast("Stored keys removed.");
      await this.engine.applySettings();
    });
  }

  #clearFieldErrors() {
    for (const el of document.querySelectorAll(".field-error")) { el.textContent = ""; el.classList.remove("visible"); }
    for (const el of document.querySelectorAll("input.invalid")) el.classList.remove("invalid");
  }

  /* ---------------------------------------------------------------- */
  /*  Toasts                                                           */
  /* ---------------------------------------------------------------- */

  toast(text, kind = "info", ttl = 4000) {
    const el = document.createElement("div");
    el.className = `toast ${kind === "error" ? "toast-error" : ""}`;
    el.textContent = text;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), ttl);
  }
}
