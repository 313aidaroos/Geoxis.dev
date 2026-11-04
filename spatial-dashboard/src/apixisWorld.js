// Apixis world agent client (Geoxis, 2026-09-30)
// Calls server provision endpoint and shows welcome card
// Fix 2026-10-04 (Grok): send the session Bearer token; without it the endpoint always answered 401.
import { getToken } from "./authClient.js";

export async function provisionIfNeeded() {
  const token = getToken();
  if (!token) return { ok: false, needsSignIn: true };
  try {
    const response = await fetch("/api/world/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      return { ok: false, needsSignIn: true };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("[world] provision failed:", err);
    return { ok: false, error: "network_error" };
  }
}

export function showWelcomeCard(data) {
  if (!data?.ok || !data?.showWelcome) return;

  // Check if already shown this session
  if (sessionStorage.getItem("world_welcome_shown")) return;
  sessionStorage.setItem("world_welcome_shown", "1");

  const escapedName = document.createElement("span");
  escapedName.textContent = data.agentName || "your agent";
  const agentName = escapedName.innerHTML;
  const isReady = data.status === "ready";

  // Create welcome card matching Geoxis theme
  const card = document.createElement("div");
  card.id = "worldWelcomeCard";
  card.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 32px;
    max-width: 480px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    font-family: 'Special Elite', monospace;
    color: #e2e8f0;
  `;

  const title = isReady ? "Your agent is ready" : "Welcome to Apixis";
  const message = isReady
    ? `<strong style="color: #10b981;">${agentName}</strong> is waiting for you in the Apixis world.`
    : `Enter the Apixis world to create or meet <strong style="color: #10b981;">${agentName}</strong>.`;

  card.innerHTML = `
    <div style="text-align: center;">
      <h2 style="margin: 0 0 12px 0; font-size: 24px; color: #10b981;">
        ${title}
      </h2>
      <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
        ${message}
      </p>
      <a href="https://www.apixis.dev/enter?from=geoxis" 
         style="display: inline-block; padding: 12px 32px; background: #10b981; color: #0a0a0a; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin-bottom: 12px;">
        Enter the Apixis world →
      </a>
      <button id="closeWorldCard" style="display: block; width: 100%; padding: 8px; background: transparent; border: 1px solid #333; color: #94a3b8; border-radius: 6px; cursor: pointer; font-family: 'Special Elite', monospace; font-size: 12px; margin-top: 8px;">
        Continue here for now
      </button>
    </div>
  `;

  document.body.appendChild(card);

  document.getElementById("closeWorldCard").addEventListener("click", () => {
    card.remove();
  });

  // Auto-dismiss after 15s
  setTimeout(() => {
    if (card.parentNode) card.remove();
  }, 15000);
}
