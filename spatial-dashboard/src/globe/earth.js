// The Earth: Cesium viewer with real sunlight, city lights on the night side, a slow idle spin,
// click-to-fly, and primitive collections that can hold ten thousand aircraft without a stutter.
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { markerImage, colorFor } from "./icons.js";
import { greatCirclePoints } from "../../lib/geodesy.js";

const DAY_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
// NASA Black Marble (VIIRS city lights), free WMTS from GIBS. Shown only on the night side.
const NIGHT_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";

export const OVERVIEW_HEIGHT = 17_500_000;   // whole globe in view
export const ATMOSPHERE_HEIGHT = 1_400_000;  // "in the atmosphere": a region, assets readable
export const ASSET_HEIGHT = 380_000;         // close on one asset
export const SPIN_PERIOD_S = 120;            // one turn every 2 minutes
export const IDLE_RESUME_MS = 30_000;

const PX = { aircraft: 26, vessel: 26, truck: 24, container: 24, drone: 24, person: 24, train: 24, other: 22 };

export class Earth {
  constructor({ container, onSelect, onHover, onCamera }) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.onCamera = onCamera || (() => {});
    this.viewer = null;
    this.billboards = null;
    this.labels = null;
    this.trails = null;
    this.routes = null;
    this.marks = new Map();     // id -> { bb, label, type, alarm }
    this.spinning = true;
    this.spinAllowed = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.idleAt = 0;
    this.selectedId = null;
    this.followId = null;
    this.labelsOn = true;
    this.nightLayer = null;
    this.weatherLayer = null;
    this.riskEntities = [];
    this.dayNight = true;
    this._lastTick = performance.now();
    this._camTimer = null;
  }

  async init() {
    const base = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.ArcGisMapServerImageryProvider.fromUrl(DAY_URL, { enablePickFeatures: false }),
    );
    const viewer = new Cesium.Viewer(this.container, {
      baseLayer: base,
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: true, requestRenderMode: false,
      // Transparent GL so the animated universe (src/globe/universe.js) shows behind the Earth.
      contextOptions: { webgl: { alpha: true, antialias: true, powerPreference: "high-performance", premultipliedAlpha: true } },
    });
    this.viewer = viewer;
    const scene = viewer.scene;
    const globe = scene.globe;
    base.nightAlpha = 0.28;

    try {
      this.nightLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
        url: NIGHT_URL, maximumLevel: 8, credit: "NASA GIBS Black Marble",
        rectangle: Cesium.Rectangle.fromDegrees(-180, -85.05, 180, 85.05),
      }));
      this.nightLayer.dayAlpha = 0;
      this.nightLayer.nightAlpha = 1;
      this.nightLayer.brightness = 1.35;
    } catch (err) {
      console.warn("[earth] night lights unavailable", err);
    }

    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
    globe.showGroundAtmosphere = true;
    globe.baseColor = Cesium.Color.fromCssColorString("#060b1a");
    globe.depthTestAgainstTerrain = false;
    scene.backgroundColor = Cesium.Color.TRANSPARENT;
    scene.skyBox.show = false;
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.brightnessShift = 0.1;
    scene.skyAtmosphere.saturationShift = 0.15;
    scene.sun.show = true;
    scene.moon.show = true; // the real Moon, where it actually is right now
    scene.fog.enabled = true;
    scene.fog.density = 0.00012;
    scene.postProcessStages.fxaa.enabled = true;
    scene.highDynamicRange = false;
    scene.screenSpaceCameraController.minimumZoomDistance = 1200;
    scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;
    scene.screenSpaceCameraController.enableCollisionDetection = true;

    this.billboards = scene.primitives.add(new Cesium.BillboardCollection({ scene }));
    this.labels = scene.primitives.add(new Cesium.LabelCollection({ scene }));
    this.trails = scene.primitives.add(new Cesium.PolylineCollection());
    this.routes = scene.primitives.add(new Cesium.PolylineCollection());
    this.#buildRiskZones();
    this.#installInput();

    viewer.clock.onTick.addEventListener(() => this.#tick());
    viewer.camera.percentageChanged = 0.02;
    viewer.camera.changed.addEventListener(() => {
      clearTimeout(this._camTimer);
      this._camTimer = setTimeout(() => this.onCamera(this.cameraState()), 120);
    });
    return this;
  }

  /* ---------------- camera ---------------- */

  setView({ latitude, longitude, height = OVERVIEW_HEIGHT, pitch = -90 }) {
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 },
    });
  }

  flyTo({ latitude, longitude, height = ATMOSPHERE_HEIGHT, pitch = -55, duration = 2.2 }) {
    const cam = this.viewer.camera;
    this.release();
    const offsetDeg = pitch > -85 ? (height / 111_320) * Math.cos(Cesium.Math.toRadians(-pitch)) * 0.75 : 0;
    return new Promise((resolve) => {
      cam.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude - offsetDeg, height),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 },
        duration, easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(true), cancel: () => resolve(false),
      });
    });
  }

  zoomOut() {
    const c = this.viewer.camera.positionCartographic;
    return this.flyTo({ latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude), height: OVERVIEW_HEIGHT, pitch: -90, duration: 1.6 });
  }

  zoomBy(factor) {
    const cam = this.viewer.camera;
    const h = cam.positionCartographic.height;
    if (factor < 1) cam.zoomIn(h * (1 - factor)); else cam.zoomOut(h * (factor - 1));
    this.pauseSpin();
  }

  height() {
    return this.viewer?.camera.positionCartographic.height ?? OVERVIEW_HEIGHT;
  }

  cameraState() {
    const cam = this.viewer.camera;
    const c = cam.positionCartographic;
    const rect = cam.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    return {
      latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude), height: c.height,
      bbox: rect ? [Cesium.Math.toDegrees(rect.south), Cesium.Math.toDegrees(rect.west), Cesium.Math.toDegrees(rect.north), Cesium.Math.toDegrees(rect.east)] : null,
    };
  }

  /** Follow an asset: keep it centred as it moves. */
  follow(id) {
    this.followId = id;
    this.pauseSpin(Infinity);
  }

  release() {
    if (this.followId) {
      this.followId = null;
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  }

  /* ---------------- spin ---------------- */

  pauseSpin(ms = IDLE_RESUME_MS) {
    this.idleAt = ms === Infinity ? Infinity : performance.now() + ms;
  }

  setSpin(on) {
    this.spinning = on;
    if (on) this.idleAt = 0;
  }

  #tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastTick) / 1000);
    this._lastTick = now;
    if (this.followId) {
      const m = this.marks.get(this.followId);
      if (m?.bb) {
        const range = Math.max(60_000, Math.min(this.height(), 1_200_000));
        this.viewer.camera.lookAt(m.bb.position, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range));
      }
      return;
    }
    if (!this.spinning || !this.spinAllowed || this.selectedId || now < this.idleAt) return;
    const h = this.height();
    if (h < ATMOSPHERE_HEIGHT * 2.2) return; // never spin when zoomed into a region
    this.viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -(2 * Math.PI / SPIN_PERIOD_S) * dt);
  }

  /* ---------------- input ---------------- */

  #installInput() {
    const scene = this.viewer.scene;
    const canvas = scene.canvas;
    const bump = () => this.pauseSpin();
    for (const ev of ["pointerdown", "wheel", "touchstart"]) canvas.addEventListener(ev, bump, { passive: true });

    const handler = new Cesium.ScreenSpaceEventHandler(canvas);
    handler.setInputAction(({ position }) => {
      const picked = scene.pick(position);
      const id = picked && typeof picked.id === "string" ? picked.id : null;
      if (id && this.marks.has(id)) { this.onSelect(id, "pick"); return; }
      const ray = this.viewer.camera.getPickRay(position);
      const cart = ray ? scene.globe.pick(ray, scene) : null;
      if (!cart) return;
      const c = Cesium.Cartographic.fromCartesian(cart);
      this.onSelect(null, "globe", { latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude) });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    let lastHover = null;
    handler.setInputAction(({ endPosition }) => {
      const picked = scene.pick(endPosition);
      const id = picked && typeof picked.id === "string" && this.marks.has(picked.id) ? picked.id : null;
      canvas.style.cursor = id ? "pointer" : "grab";
      if (id !== lastHover) { lastHover = id; this.onHover(id, endPosition); }
      else if (id) this.onHover(id, endPosition);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    this._handler = handler;
  }

  /* ---------------- marks ---------------- */

  #scalars(type) {
    const far = type === "aircraft" ? 0.2 : 0.4;
    return {
      scaleByDistance: new Cesium.NearFarScalar(250_000, 1.0, 12_000_000, far),
      translucencyByDistance: new Cesium.NearFarScalar(3_000_000, 1.0, 20_000_000, 0.75),
    };
  }

  upsert(a, pos) {
    const position = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, Math.max(0, pos.altitudeMeters ?? a.altitudeMeters ?? 0));
    const rotation = -Cesium.Math.toRadians(Number(a.heading) || 0);
    let m = this.marks.get(a.id);
    const state = this.selectedId === a.id ? "selected" : a.alarm ? "alarm" : "normal";
    if (!m) {
      const px = PX[a.type] || 24;
      const s = this.#scalars(a.type);
      const bb = this.billboards.add({
        id: a.id, position, image: markerImage(a.type, state), rotation,
        alignedAxis: a.type === "aircraft" || a.type === "vessel" || a.type === "truck" ? Cesium.Cartesian3.UNIT_Z : Cesium.Cartesian3.ZERO,
        width: px * 1.9, height: px * 1.9,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        ...s,
      });
      const label = this.labels.add({
        position, text: a.name || a.id,
        font: "600 12px Inter, system-ui, sans-serif",
        fillColor: Cesium.Color.fromCssColorString("#eef2ff"),
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Cesium.Color.fromCssColorString("#060b1a").withAlpha(0.9), outlineWidth: 3,
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#0b1226").withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -20), verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, a.type === "aircraft" ? 900_000 : 6_000_000),
      });
      m = { bb, label, type: a.type, state };
      this.marks.set(a.id, m);
    } else {
      m.bb.position = position;
      m.bb.rotation = rotation;
      m.label.position = position;
      if (m.label.text !== (a.name || a.id)) m.label.text = a.name || a.id;
      if (m.state !== state || m.type !== a.type) { m.bb.image = markerImage(a.type, state); m.state = state; m.type = a.type; }
    }
    m.bb.show = pos.show !== false;
    m.label.show = this.labelsOn && pos.show !== false && (!this.selectedId || this.selectedId === a.id);
    return m;
  }

  remove(id) {
    const m = this.marks.get(id);
    if (!m) return;
    this.billboards.remove(m.bb);
    this.labels.remove(m.label);
    this.marks.delete(id);
    if (this.followId === id) this.release();
  }

  setLabels(on) {
    this.labelsOn = on;
    for (const [id, m] of this.marks) m.label.show = on && m.bb.show && (!this.selectedId || this.selectedId === id);
  }

  /** Selection: everything else fades to a faint dot; exit restores. */
  setSelected(id) {
    const prev = this.selectedId;
    this.selectedId = id;
    const dim = Cesium.Color.WHITE.withAlpha(0.14);
    for (const [mid, m] of this.marks) {
      const isSel = mid === id;
      m.bb.color = id && !isSel ? dim : Cesium.Color.WHITE;
      m.label.show = this.labelsOn && m.bb.show && (!id || isSel);
      if (mid === prev || isSel) {
        const st = isSel ? "selected" : m.state === "selected" ? "normal" : m.state;
        m.bb.image = markerImage(m.type, st);
        m.state = st;
      }
    }
    if (!id) this.clearRoute();
  }

  positionOf(id) {
    const m = this.marks.get(id);
    if (!m) return null;
    const c = Cesium.Cartographic.fromCartesian(m.bb.position);
    return { latitude: Cesium.Math.toDegrees(c.latitude), longitude: Cesium.Math.toDegrees(c.longitude), height: c.height };
  }

  /* ---------------- trails & routes ---------------- */

  setTrail(id, points, type) {
    const key = `trail:${id}`;
    let line = this._trailById?.get(key);
    if (!this._trailById) this._trailById = new Map();
    if (!points || points.length < 2) {
      if (line) { this.trails.remove(line); this._trailById.delete(key); }
      return;
    }
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(points.flatMap((p) => [p.longitude, p.latitude, Math.max(0, p.altitudeMeters || 0)]));
    if (!line) {
      line = this.trails.add({
        positions, width: 2,
        material: Cesium.Material.fromType("PolylineGlow", { color: Cesium.Color.fromCssColorString(colorFor(type)).withAlpha(0.7), glowPower: 0.25, taperPower: 0.6 }),
      });
      this._trailById.set(key, line);
    } else {
      line.positions = positions;
    }
  }

  clearTrails(except = null) {
    if (!this._trailById) return;
    for (const [key, line] of this._trailById) {
      if (except && key === `trail:${except}`) continue;
      this.trails.remove(line);
      this._trailById.delete(key);
    }
  }

  /** Dashed glowing arc from A to B (the selected asset's route), through the current position. */
  showRoute(route) {
    this.clearRoute();
    this.addRoute(route);
  }

  /** Append one route without clearing the others (the Routes layer). */
  addRoute({ from, to, via, color = "#76a5ff" }) {
    const segs = [];
    if (from && via) segs.push([from, via, 0.95]);
    if (via && to) segs.push([via, to, 0.55]);
    if (!segs.length && from && to) segs.push([from, to, 0.8]);
    for (const [a, b, alpha] of segs) {
      const pts = greatCirclePoints(a.latitude, a.longitude, b.latitude, b.longitude, 96);
      const positions = Cesium.Cartesian3.fromDegreesArrayHeights(pts.flatMap((p) => [p.longitude, p.latitude, 12_000 + Math.sin(p.t * Math.PI) * 140_000]));
      this.routes.add({ positions, width: 7, material: Cesium.Material.fromType("PolylineGlow", { color: Cesium.Color.fromCssColorString(color).withAlpha(alpha * 0.45), glowPower: 0.3 }) });
      this.routes.add({ positions, width: 2.2, material: Cesium.Material.fromType("PolylineDash", { color: Cesium.Color.fromCssColorString(color).withAlpha(alpha), gapColor: Cesium.Color.TRANSPARENT, dashLength: 18 }) });
    }
    for (const p of [from, to]) {
      if (!p) continue;
      this.routes.add({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([p.longitude, p.latitude, 0, p.longitude, p.latitude, 60_000]),
        width: 3, material: Cesium.Material.fromType("PolylineGlow", { color: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.6), glowPower: 0.4 }),
      });
    }
  }

  clearRoute() {
    this.routes.removeAll();
  }

  /* ---------------- layers ---------------- */

  setDayNight(on) {
    this.dayNight = on;
    this.viewer.scene.globe.enableLighting = on;
    this.viewer.scene.globe.showGroundAtmosphere = on;
    if (this.nightLayer) this.nightLayer.show = on;
  }

  async setWeather(on) {
    if (!on) { if (this.weatherLayer) this.weatherLayer.show = false; return true; }
    if (this.weatherLayer) { this.weatherLayer.show = true; return true; }
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      const meta = await res.json();
      const latest = (meta?.radar?.past ?? []).at(-1);
      if (!latest) throw new Error("no radar frames");
      const provider = new Cesium.UrlTemplateImageryProvider({ url: `${meta.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`, maximumLevel: 12, credit: "Radar © RainViewer" });
      this.weatherLayer = this.viewer.imageryLayers.addImageryProvider(provider);
      this.weatherLayer.alpha = 0.6;
      return true;
    } catch (err) {
      console.warn("[earth] weather unavailable", err);
      return false;
    }
  }

  setRisk(on) {
    for (const e of this.riskEntities) e.show = on;
  }

  #buildRiskZones() {
    const zones = [
      { name: "Maasvlakte anchorage congestion", lat: 51.93, lon: 3.98, a: 5500, b: 3200, rot: 20, level: "medium" },
      { name: "Restricted exercise area", lat: 52.02, lon: 3.85, a: 7000, b: 7000, rot: 0, level: "high" },
      { name: "Dredging corridor", lat: 51.985, lon: 4.05, a: 6000, b: 900, rot: -35, level: "low" },
    ];
    const palette = { low: "#fbbf24", medium: "#f59e0b", high: "#ef4444" };
    for (const z of zones) {
      const color = Cesium.Color.fromCssColorString(palette[z.level]);
      this.riskEntities.push(this.viewer.entities.add({
        id: `risk:${z.name}`, position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat),
        ellipse: { semiMajorAxis: z.a, semiMinorAxis: z.b, rotation: Cesium.Math.toRadians(z.rot), material: color.withAlpha(0.12), outline: true, outlineColor: color.withAlpha(0.75), outlineWidth: 2, height: 2 },
      }));
    }
  }

  destroy() {
    this._handler?.destroy();
    this.viewer?.destroy();
  }
}
