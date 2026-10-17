// /fleet: the signed-in tenant's assets, ingest keys and plan. Reads /api/plan, /api/assets,
// /api/ingest-keys; creates and revokes keys. Nothing here charges anything.
import { mountShell, toast } from "./shell.js";
import { authHeader, getToken, loadMe } from "./authClient.js";
import { iconSvg, TYPE_LABELS } from "./globe/icons.js";

mountShell({ active: "fleet" });

const body = document.getElementById("fleetBody");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const next = encodeURIComponent("/fleet");

function signedOut() {
  body.innerHTML = `<div class="panel" style="max-width:560px"><div class="panel-body" style="display:grid;gap:12px">
    <h2 class="sub">Sign in to see your fleet</h2>
    <p class="muted" style="margin:0">Your assets and ingest keys are private to your company. New accounts are created with Apixis ID.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary" href="/auth/apixis/start?next=${next}">Sign in with Apixis</a><a class="btn btn-ghost" href="/login">Existing account</a></div>
  </div></div>`;
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json", ...authHeader() }, ...opts });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function render() {
  if (!getToken()) return signedOut();
  const me = await loadMe().catch(() => null);
  if (!me) return signedOut();
  body.innerHTML = `<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:220px"></div>`;
  const [plan, assets, keys] = await Promise.all([getJson("/api/plan"), getJson("/api/assets"), getJson("/api/ingest-keys")]);
  const p = plan.data || {};
  const list = (assets.data?.assets || []).filter((a) => assets.data?.demo === false);
  const demo = assets.data?.demo !== false;
  const keyRows = keys.data?.keys || [];
  const used = p.objectsUsed ?? list.length;
  const limit = p.objectLimit ?? 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  body.innerHTML = `
    <div class="grid-3">
      <div class="panel"><div class="panel-body">
        <div class="label">Plan</div>
        <div class="stat-row"><span class="stat-big">${limit}</span><span class="muted">things you can follow</span></div>
        <div class="bar" style="height:8px;border-radius:4px;background:var(--bg-3);margin:10px 0 6px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:var(--primary);border-radius:4px"></i></div>
        <div class="muted" style="font-size:12px">${used} in use${p.renewsAt ? ` · renews ${when(p.renewsAt)}` : ""}${p.trial?.active ? ` · trial until ${when(p.trial.expiresAt)}` : ""}</div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-primary btn-sm" href="/pricing">${limit ? "Add more things" : p.trial?.used ? "Choose a plan" : "Start free trial"}</a></div>
      </div></div>
      <div class="panel"><div class="panel-body">
        <div class="label">Company</div>
        <div class="stat-big" style="font-size:20px">${esc(me.tenant?.name || me.tenant?.slug || "")}</div>
        <div class="muted" style="font-size:12px;margin-top:4px">${esc(me.user?.email || "")} · ${esc(me.role || "member")}</div>
        <div class="muted" style="font-size:12px;margin-top:10px">Anyone whose email uses your domain joins this company automatically.</div>
      </div></div>
      <div class="panel"><div class="panel-body">
        <div class="label">Ingest keys</div>
        <div class="stat-row"><span class="stat-big">${keyRows.filter((k) => !k.revoked_at).length}</span><span class="muted">active · max 10</span></div>
        <div class="muted" style="font-size:12px;margin-top:6px">Devices and scripts post positions with a key. The full key is shown once.</div>
        <div style="margin-top:12px"><button class="btn btn-soft btn-sm" id="btnNewKey">+ Create key</button></div>
      </div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">Your assets</div><span class="panel-sub" style="margin-left:auto">${demo ? "No positions received yet" : `${list.length} on the globe`}</span></div>
      <div class="panel-body" style="padding:0 6px 6px">
        ${demo ? `<div class="empty" style="padding:16px 10px">Nothing has posted a position yet, so the globe shows the demo fleet for you. Create a key below and send your first batch; your assets replace the demo within two seconds.</div>` : `
        <table class="tbl"><thead><tr><th></th><th>Name</th><th>ID</th><th>Destination</th><th>Speed</th><th>Status</th><th>Last fix</th></tr></thead><tbody>
          ${list.map((a) => `<tr><td>${iconSvg(a.type, { size: 14 })}</td><td><a href="/?q=${encodeURIComponent(a.id)}" style="color:var(--primary-2)">${esc(a.name)}</a></td><td class="mono">${esc(a.id)}</td><td>${esc(a.destination || "—")}</td><td>${Math.round((a.speedMps || 0) * 3.6)} km/h</td><td class="${a.alarm ? "bad" : "ok"}">${esc(a.alarm ? a.alarmReason : "Nominal")}</td><td class="muted">${when(a.timestamp)}</td></tr>`).join("")}
        </tbody></table>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">Ingest keys</div></div>
      <div class="panel-body" style="padding:0 6px 6px">
        <div id="newKeyBox" class="hidden" style="margin:10px 8px"></div>
        ${keyRows.length ? `<table class="tbl"><thead><tr><th>Label</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>
          ${keyRows.map((k) => `<tr><td>${esc(k.label)}</td><td class="mono">${esc(k.key_prefix)}…</td><td class="muted">${when(k.created_at)}</td><td class="muted">${k.last_used_at ? when(k.last_used_at) : "never"}</td><td style="text-align:right">${k.revoked_at ? '<span class="chip">revoked</span>' : `<button class="btn btn-ghost btn-sm" data-revoke="${esc(k.id)}">Revoke</button>`}</td></tr>`).join("")}
        </tbody></table>` : `<div class="empty" style="padding:16px 10px">No keys yet.</div>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div class="panel-title">Send positions</div><a class="panel-sub" href="https://github.com/313aidaroos/geoxis.dev/blob/main/spatial-dashboard/docs/INGEST.md" target="_blank" rel="noopener" style="margin-left:auto;color:var(--primary-2)">Full guide ↗</a></div>
      <div class="panel-body">
        <p class="muted" style="margin:0 0 10px">Post a batch every few seconds from any device, GPS gateway or script. Up to 500 positions per request.</p>
        <pre class="code">curl -X POST ${location.origin}/api/positions \\
  -H "Authorization: Bearer gxk_…" -H "Content-Type: application/json" \\
  -d '{"positions":[{"id":"TRUCK-12","name":"Truck 12","type":"truck","latitude":51.92,"longitude":4.47,"heading":88,"speedKph":64,"destination":"DC Waalhaven"}]}'</pre>
      </div>
    </div>`;

  document.getElementById("btnNewKey").addEventListener("click", async () => {
    const label = prompt("Label for this key (for example: warehouse gateway)", "default");
    if (label === null) return;
    const r = await getJson("/api/ingest-keys", { method: "POST", body: JSON.stringify({ label }) });
    if (!r.ok) return toast(r.data.error === "too_many_keys" ? "You already have 10 active keys. Revoke one first." : r.data.message || "Could not create the key.", "error");
    const box = document.getElementById("newKeyBox");
    box.classList.remove("hidden");
    box.innerHTML = `<div class="panel" style="border-color:rgba(52,211,153,.4)"><div class="panel-body">
      <div class="ok" style="font-weight:600">Key created. Copy it now, it will not be shown again.</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><code class="mono" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-0);word-break:break-all">${esc(r.data.key)}</code><button class="btn btn-soft btn-sm" id="copyKey">Copy</button></div>
    </div></div>`;
    document.getElementById("copyKey").addEventListener("click", () => navigator.clipboard?.writeText(r.data.key).then(() => toast("Copied.")));
    setTimeout(render, 15_000);
  });
  for (const b of body.querySelectorAll("[data-revoke]")) b.addEventListener("click", async () => {
    if (!confirm("Revoke this key? Devices using it will stop posting.")) return;
    const r = await getJson("/api/ingest-keys", { method: "DELETE", body: JSON.stringify({ id: b.dataset.revoke }) });
    if (!r.ok) return toast(r.data.message || "Could not revoke.", "error");
    toast("Key revoked.");
    render();
  });
}

render();
