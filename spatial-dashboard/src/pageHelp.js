// Small Cixy button. Opens step-by-step help for this page. Plain words only.

function fillSteps(list, steps) {
  list.replaceChildren();
  steps.forEach((text, index) => {
    const item = document.createElement("li");
    const body = document.createElement("span");
    body.textContent = text;
    item.append(body);
    list.append(item);
  });
}

export function mountPageHelp({ title, steps }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-ghost btn-sm";
  btn.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:50;border-radius:999px;box-shadow:var(--shadow)";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "cixyPageHelp");
  const dot = document.createElement("span");
  dot.className = "live-dot";
  dot.setAttribute("aria-hidden", "true");
  btn.append(dot, document.createTextNode("Cixy"));

  const panel = document.createElement("section");
  panel.id = "cixyPageHelp";
  panel.className = "hidden panel";
  panel.style.cssText = "position:fixed;bottom:60px;right:16px;z-index:50;width:min(22rem,calc(100vw - 2rem))";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);

  const head = document.createElement("div");
  head.className = "panel-head";
  const heading = document.createElement("div");
  heading.className = "panel-title";
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "gx-icon-btn";
  close.style.cssText = "margin-left:auto;width:28px;height:28px";
  close.setAttribute("aria-label", "Close help");
  close.textContent = "✕";
  head.append(heading, close);

  const list = document.createElement("ol");
  list.className = "steps";
  list.style.cssText = "padding:12px 14px;margin:0";
  fillSteps(list, steps);
  panel.append(head, list);

  function setOpen(open) {
    panel.classList.toggle("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
  }
  btn.addEventListener("click", () => setOpen(panel.classList.contains("hidden")));
  close.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  document.body.append(panel, btn);
}
