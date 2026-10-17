/**
 * Full-viewport globe controls. Reuses the running Cesium viewer and live assets.
 * Does not synthesize any tracking data.
 */
export function installImmersiveGlobe(engine) {
  const main = document.querySelector("#app > main");
  const viewer = engine.map?.viewer;
  if (!main || !viewer) return () => {};
  const controls = document.createElement("div");
  controls.className = "geoxis-globe-controls";
  controls.innerHTML = '<button type="button" data-action="expand" aria-label="Expand globe">⛶ Explore 3D globe</button><button type="button" data-action="spin" aria-pressed="false">↻ Rotate Earth</button><button type="button" data-action="close" hidden>✕ Exit globe</button>';
  main.appendChild(controls);
  const expand = controls.querySelector('[data-action="expand"]');
  const spin = controls.querySelector('[data-action="spin"]');
  const close = controls.querySelector('[data-action="close"]');

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let rotating = false;
  let expanded = false;
  let last = null;
  function tick(scene, time) {
    const now = performance.now();
    if (rotating && last !== null && !viewer.isDestroyed()) {
      const seconds = Math.min((now - last) / 1000, .1);
      viewer.camera.rotateRight(seconds * .008);
    }
    last = now;
  }
  function setSpin(value) {
    rotating = Boolean(value) && !reduceMotion.matches;
    spin.setAttribute("aria-pressed", String(rotating));
    spin.textContent = rotating ? "Ⅱ Pause rotation" : "↻ Rotate Earth";
    last = null;
  }
  function setExpanded(value) {
    expanded = value;
    document.body.classList.toggle("geoxis-immersive", value);
    close.hidden = !value;
    expand.hidden = value;
    viewer.resize();
    if (value) {
      viewer.trackedEntity = undefined;
      viewer.camera.flyHome(1.2);
    }
  }
  expand.addEventListener("click", () => setExpanded(true));
  close.addEventListener("click", () => setExpanded(false));
  spin.addEventListener("click", () => setSpin(!rotating));
  const onKey = e => { if (e.key === "Escape" && expanded) setExpanded(false); };
  document.addEventListener("keydown", onKey);
  const stopOnInteraction = () => setSpin(false);
  viewer.canvas.addEventListener("pointerdown", stopOnInteraction);
  viewer.scene.preRender.addEventListener(tick);
  setSpin(false);
  return () => {
    setSpin(false); setExpanded(false);
    document.removeEventListener("keydown", onKey);
    viewer.canvas.removeEventListener("pointerdown", stopOnInteraction);
    viewer.scene.preRender.removeEventListener(tick);
    controls.remove();
  };
}
