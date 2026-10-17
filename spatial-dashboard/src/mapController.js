/**
 * mapController.js — CesiumJS viewer wrapper.
 *
 * Responsibilities:
 *   • Boot the viewer with the enterprise camera posture over Rotterdam.
 *   • Load Google Photorealistic 3D Tiles when a key is available, fall back
 *     to the default Cesium globe otherwise.
 *   • Render assets as minimal, color-coded SVG billboards with heading.
 *   • Maintain optional layers: movement trails, risk zones, weather radar.
 *   • Expose camera helpers and a viewport-context query for the AI agent.
 */

import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

/** Marker palette per asset type. Kept in one place so UI and map agree. */
export const ASSET_STYLES = Object.freeze({
  vessel:   { color: "#34d399", label: "Vessel" },
  truck:    { color: "#38bdf8", label: "Truck" },
  drone:    { color: "#a78bfa", label: "Drone" },
  aircraft: { color: "#fbbf24", label: "Aircraft" },
  default:  { color: "#94a3b8", label: "Asset" },
});

const TRAIL_MAX_POINTS = 60;

export class GeospatialMap {
  /**
   * @param {object} opts
   * @param {string} opts.containerId
   * @param {import("./main.js").EventBus} opts.bus
   * @param {import("./main.js").AppState} opts.state
   * @param {{latitude:number, longitude:number}} opts.origin
   * @param {number} opts.altitude   initial camera height in meters
   * @param {number} opts.pitch      initial camera pitch in degrees (negative = looking down)
   */
  constructor({ containerId, bus, state, origin, altitude = 18_000, pitch = -45 }) {
    this.containerId = containerId;
    this.bus = bus;
    this.state = state;
    this.origin = origin;
    this.initialAltitude = altitude;
    this.initialPitch = pitch;

    /** @type {Cesium.Viewer|null} */
    this.viewer = null;
    this.googleTileset = null;
    this.weatherLayer = null;

    this.assetEntities = new Map();   // id -> Cesium.Entity (billboard)
    this.trailEntities = new Map();   // id -> Cesium.Entity (polyline)
    this.trailPositions = new Map();  // id -> Cesium.Cartesian3[]
    this.riskZones = [];
    this.layerVisibility = { fleet: true, weather: false, risk: true, trails: true };

    this.#iconCache = new Map();
    this.#clickHandler = null;
    this.#statusEl = document.getElementById("mapStatus");
  }

  #iconCache;
  #clickHandler;
  #statusEl;

  /* ---------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  async initialize({ googleMapsKey = "" } = {}) {
    this.#setStatus("Initializing globe…");

    this.viewer = new Cesium.Viewer(this.containerId, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      requestRenderMode: false,
      terrain: undefined,
      baseLayer: false,
    });

    const scene = this.viewer.scene;
    scene.globe.enableLighting = false;
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b356c");
    // The ellipsoid remains visible even when third-party imagery fails or is blocked.
    try {
      const imagery = await Cesium.ArcGisMapServerImageryProvider.fromUrl("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer");
      this.viewer.imageryLayers.addImageryProvider(imagery);
    } catch (error) {
      console.warn("[map] Satellite imagery unavailable; using visible globe fallback", error);
      this.#setStatus("Satellite imagery unavailable — displaying globe fallback.");
    }
    scene.backgroundColor = Cesium.Color.fromCssColorString("#0f1117");
    scene.skyAtmosphere.show = true;
    scene.fog.enabled = true;
    scene.fog.density = 0.00015;
    scene.postProcessStages.fxaa.enabled = true;

    // Keep the camera from diving underground / under the tileset.
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    scene.screenSpaceCameraController.minimumZoomDistance = 80;

    this.#installPicking();
    this.#buildRiskZones();
    this.setInitialCamera(false);

    await this.setGoogleTiles(googleMapsKey);
    this.#setStatus(this.#describeCamera());

    // Keep the bottom-left readout current as the user pans.
    this.viewer.camera.changed.addEventListener(() => {
      this.#setStatus(this.#describeCamera());
      this.bus.emit("map:cameraChanged", this.getCameraState());
    });
    this.viewer.camera.percentageChanged = 0.01;

    this.bus.emit("map:ready");
    return this;
  }

  destroy() {
    this.#clickHandler?.destroy();
    this.viewer?.destroy();
    this.viewer = null;
  }

  /* ---------------------------------------------------------------- */
  /*  Google Photorealistic 3D Tiles                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Loads (or unloads) Google Photorealistic 3D Tiles. Safe to call again
   * when the key changes; the previous tileset is removed first.
   */
  async setGoogleTiles(apiKey) {
    if (!this.viewer) return;

    if (this.googleTileset) {
      this.viewer.scene.primitives.remove(this.googleTileset);
      this.googleTileset = null;
      this.viewer.scene.globe.show = true;
    }

    if (!apiKey) {
      this.#setStatus("Using default globe — add a Google Maps key for photorealistic 3D tiles.");
      return false;
    }

    this.#setStatus("Loading Google 3D tiles…");
    try {
      Cesium.GoogleMaps.defaultApiKey = apiKey;
      this.googleTileset = await Cesium.createGooglePhotorealistic3DTileset({
        // Only load what the camera can actually see at this zoom;
        // ~8px SSE keeps the enterprise view crisp without overfetching.
        maximumScreenSpaceError: 8,
        skipLevelOfDetail: true,
        preloadWhenHidden: false,
        showCreditsOnScreen: true,
      });
      this.viewer.scene.primitives.add(this.googleTileset);
      // Google tiles include their own terrain surface; hide the ellipsoid
      // globe so it doesn't z-fight with the mesh.
      this.viewer.scene.globe.show = false;
      this.#setStatus(this.#describeCamera());
      this.bus.emit("map:tilesLoaded", "google");
      return true;
    } catch (err) {
      console.error("[map] Google 3D tiles failed to load", err);
      this.googleTileset = null;
      this.viewer.scene.globe.show = true;
      this.#setStatus("Google 3D tiles unavailable — check that the Map Tiles API is enabled for this key.");
      this.bus.emit("map:tilesError", err);
      return false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Camera                                                           */
  /* ---------------------------------------------------------------- */

  setInitialCamera(animate = true) {
    const { latitude, longitude } = this.origin;
    const offsetDeg = (this.initialAltitude / 111_320) * 0.9;
    const dest = Cesium.Cartesian3.fromDegrees(longitude, latitude - offsetDeg, this.initialAltitude);
    const orientation = {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(this.initialPitch),
      roll: 0,
    };
    if (animate) {
      this.viewer.camera.flyTo({ destination: dest, orientation, duration: 1.6 });
    } else {
      this.viewer.camera.setView({ destination: dest, orientation });
    }
  }

  /**
   * Flies the camera to a point, keeping the enterprise 45° pitch.
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} altitude  camera height above the target, meters
   */
  flyToAsset(latitude, longitude, altitude = 3000) {
    if (!this.viewer) return Promise.resolve(false);
    const offsetDeg = (altitude / 111_320) * 0.9;
    const destination = Cesium.Cartesian3.fromDegrees(longitude, latitude - offsetDeg, altitude);
    return new Promise((resolve) => {
      this.viewer.trackedEntity = undefined;
      this.viewer.camera.flyTo({
        destination,
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.8,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(true),
        cancel: () => resolve(false),
      });
    });
  }

  /** Locks the camera onto an asset entity; pass null to release. */
  trackAsset(id) {
    if (!this.viewer) return;
    const entity = id ? this.assetEntities.get(id) : undefined;
    if (entity && this.viewer.trackedEntity !== entity) {
      this.viewer.trackedEntity = entity;
    } else if (!entity) {
      this.viewer.trackedEntity = undefined;
    }
  }

  getCameraState() {
    if (!this.viewer) return null;
    const cam = this.viewer.camera;
    const carto = cam.positionCartographic;
    const center = this.#pickCenterCartographic();
    const rect = cam.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    return {
      camera: {
        latitude: Cesium.Math.toDegrees(carto.latitude),
        longitude: Cesium.Math.toDegrees(carto.longitude),
        altitudeMeters: Math.round(carto.height),
        headingDeg: Math.round(Cesium.Math.toDegrees(cam.heading)),
        pitchDeg: Math.round(Cesium.Math.toDegrees(cam.pitch)),
      },
      center: center
        ? { latitude: Cesium.Math.toDegrees(center.latitude), longitude: Cesium.Math.toDegrees(center.longitude) }
        : null,
      boundingBox: rect
        ? {
            west: Cesium.Math.toDegrees(rect.west),
            south: Cesium.Math.toDegrees(rect.south),
            east: Cesium.Math.toDegrees(rect.east),
            north: Cesium.Math.toDegrees(rect.north),
          }
        : null,
    };
  }

  /** Returns the asset frames whose positions fall inside the current view. */
  getVisibleAssets() {
    const cs = this.getCameraState();
    if (!cs?.boundingBox) return [];
    const { west, south, east, north } = cs.boundingBox;
    const out = [];
    for (const a of this.state.assets.values()) {
      if (a.latitude >= south && a.latitude <= north && a.longitude >= west && a.longitude <= east) {
        out.push(a);
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /*  Assets                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Creates or updates an asset marker. Called once per telemetry frame,
   * so it avoids allocating new entities on the hot path.
   *
   * @param {string} id
   * @param {string} type      "vessel" | "truck" | "drone" | …
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} heading   degrees, true north = 0, clockwise
   * @param {object} metadata  full telemetry frame; stored on entity.properties
   */
  upsertAssetMarker(id, type, latitude, longitude, heading, metadata = {}) {
    if (!this.viewer) return null;
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, metadata.altitudeMeters ?? 0);
    const rotation = -Cesium.Math.toRadians(heading); // billboard rotation is CCW
    const style = ASSET_STYLES[type] ?? ASSET_STYLES.default;
    const isSelected = this.state.selectedAssetId === id;
    const image = this.#markerIcon(style.color, metadata.alarm === true, isSelected);

    let entity = this.assetEntities.get(id);
    if (!entity) {
      entity = this.viewer.entities.add({
        id: `asset:${id}`,
        position,
        billboard: {
          image,
          rotation,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          width: 28,
          height: 28,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          heightReference: this.googleTileset
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1_000, 1.1, 60_000, 0.6),
        },
        label: {
          text: metadata.name ?? id,
          font: "500 12px 'Special Elite', monospace",
          fillColor: Cesium.Color.fromCssColorString("#e2e8f0"),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#161922").withAlpha(0.85),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          pixelOffset: new Cesium.Cartesian2(0, -24),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 40_000),
        },
        properties: { assetId: id, ...metadata },
      });
      this.assetEntities.set(id, entity);
      this.trailPositions.set(id, []);
    } else {
      entity.position = position;
      entity.billboard.rotation = rotation;
      entity.billboard.image = image;
      entity.label.text = metadata.name ?? id;
      entity.properties = new Cesium.PropertyBag({ assetId: id, ...metadata });
    }
    entity.show = this.layerVisibility.fleet;

    this.#pushTrail(id, position, style.color);
    return entity;
  }

  removeAssetMarker(id) {
    if (!this.viewer) return;
    const e = this.assetEntities.get(id);
    if (e) {
      if (this.viewer.trackedEntity === e) this.viewer.trackedEntity = undefined;
      this.viewer.entities.remove(e);
      this.assetEntities.delete(id);
    }
    const t = this.trailEntities.get(id);
    if (t) {
      this.viewer.entities.remove(t);
      this.trailEntities.delete(id);
    }
    this.trailPositions.delete(id);
  }

  /** Re-renders the icon for a selection change without touching position. */
  refreshAssetStyle(id) {
    const a = this.state.assets.get(id);
    if (a) this.upsertAssetMarker(a.id, a.type, a.latitude, a.longitude, a.heading, a);
  }

  #pushTrail(id, position, color) {
    const pts = this.trailPositions.get(id);
    if (!pts) return;
    pts.push(position);
    if (pts.length > TRAIL_MAX_POINTS) pts.shift();
    if (pts.length < 2) return;

    let trail = this.trailEntities.get(id);
    if (!trail) {
      trail = this.viewer.entities.add({
        id: `trail:${id}`,
        polyline: {
          positions: new Cesium.CallbackProperty(() => this.trailPositions.get(id) ?? [], false),
          width: 2,
          clampToGround: !this.googleTileset,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.fromCssColorString(color).withAlpha(0.55),
            outlineWidth: 0,
          }),
        },
      });
      this.trailEntities.set(id, trail);
    }
    trail.show = this.layerVisibility.trails && this.layerVisibility.fleet;
  }

  /**
   * Builds a minimal directional pin as an SVG data-URI: a solid disc with a
   * short heading tick. Cached per (color, alarm, selected) so the hot path
   * never re-encodes SVG.
   */
  #markerIcon(color, alarm, selected) {
    const key = `${color}|${alarm}|${selected}`;
    if (this.#iconCache.has(key)) return this.#iconCache.get(key);

    const ring = selected ? "#f8fafc" : alarm ? "#f59e0b" : "#0f1117";
    const ringWidth = selected || alarm ? 2.5 : 1.5;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
        <path d="M28 4 L33 16 L23 16 Z" fill="${color}" />
        <circle cx="28" cy="30" r="12" fill="${color}" stroke="${ring}" stroke-width="${ringWidth}" />
        <circle cx="28" cy="30" r="4" fill="#0f1117" opacity=".55" />
      </svg>`.replace(/\s+/g, " ").trim();
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    this.#iconCache.set(key, uri);
    return uri;
  }

  /* ---------------------------------------------------------------- */
  /*  Layers                                                           */
  /* ---------------------------------------------------------------- */

  async setLayerVisible(name, enabled) {
    this.layerVisibility[name] = enabled;
    switch (name) {
      case "fleet":
        for (const e of this.assetEntities.values()) e.show = enabled;
        for (const t of this.trailEntities.values()) t.show = enabled && this.layerVisibility.trails;
        break;
      case "trails":
        for (const t of this.trailEntities.values()) t.show = enabled && this.layerVisibility.fleet;
        break;
      case "risk":
        for (const z of this.riskZones) z.show = enabled;
        break;
      case "weather":
        await this.#setWeatherVisible(enabled);
        break;
    }
  }

  /**
   * Risk zones: anchorage congestion, a restricted naval area, and a
   * dredging corridor. Static demo geometry near the port approaches.
   */
  #buildRiskZones() {
    const zones = [
      { name: "Maasvlakte anchorage congestion", lat: 51.93, lon: 3.98, semiMajor: 5500, semiMinor: 3200, rot: 20, level: "medium" },
      { name: "Restricted exercise area", lat: 52.02, lon: 3.85, semiMajor: 7000, semiMinor: 7000, rot: 0, level: "high" },
      { name: "Dredging corridor", lat: 51.985, lon: 4.05, semiMajor: 6000, semiMinor: 900, rot: -35, level: "low" },
    ];
    const palette = { low: "#fbbf24", medium: "#f59e0b", high: "#ef4444" };

    for (const z of zones) {
      const color = Cesium.Color.fromCssColorString(palette[z.level]);
      const entity = this.viewer.entities.add({
        id: `risk:${z.name}`,
        position: Cesium.Cartesian3.fromDegrees(z.lon, z.lat),
        ellipse: {
          semiMajorAxis: z.semiMajor,
          semiMinorAxis: z.semiMinor,
          rotation: Cesium.Math.toRadians(z.rot),
          material: color.withAlpha(0.12),
          outline: true,
          outlineColor: color.withAlpha(0.7),
          outlineWidth: 2,
          height: 2,
        },
        properties: { riskZone: true, name: z.name, level: z.level },
      });
      entity.show = this.layerVisibility.risk;
      this.riskZones.push(entity);
    }
  }

  /**
   * Weather overlay: latest precipitation radar from RainViewer's public
   * tile cache (no key required). Loaded lazily on first enable.
   */
  async #setWeatherVisible(enabled) {
    if (!this.viewer) return;
    if (!enabled) {
      if (this.weatherLayer) this.weatherLayer.show = false;
      return;
    }
    if (this.weatherLayer) {
      this.weatherLayer.show = true;
      return;
    }
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) throw new Error(`RainViewer responded ${res.status}`);
      const meta = await res.json();
      const frames = meta?.radar?.past ?? [];
      const latest = frames[frames.length - 1];
      if (!latest) throw new Error("No radar frames available");

      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `${meta.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
        maximumLevel: 12,
        credit: "Radar © RainViewer",
      });
      this.weatherLayer = this.viewer.imageryLayers.addImageryProvider(provider);
      this.weatherLayer.alpha = 0.55;
      this.weatherLayer.show = true;
    } catch (err) {
      console.warn("[map] weather overlay unavailable", err);
      this.bus.emit("map:layerError", { name: "weather", error: err });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Picking                                                          */
  /* ---------------------------------------------------------------- */

  #installPicking() {
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    handler.setInputAction(({ position }) => {
      const picked = this.viewer.scene.pick(position);
      const entity = picked?.id instanceof Cesium.Entity ? picked.id : null;
      const assetId = entity?.properties?.assetId?.getValue?.();
      const prev = this.state.selectedAssetId;
      this.state.selectAsset(assetId ?? null);
      if (prev) this.refreshAssetStyle(prev);
      if (assetId) this.refreshAssetStyle(assetId);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Cursor affordance on hover.
    handler.setInputAction(({ endPosition }) => {
      const picked = this.viewer.scene.pick(endPosition);
      const isAsset = picked?.id instanceof Cesium.Entity && picked.id.properties?.assetId;
      this.viewer.canvas.style.cursor = isAsset ? "pointer" : "default";
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    this.#clickHandler = handler;
  }

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  #pickCenterCartographic() {
    const scene = this.viewer.scene;
    const canvas = scene.canvas;
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ray = this.viewer.camera.getPickRay(center);
    if (!ray) return null;
    const hit = scene.globe.show
      ? scene.globe.pick(ray, scene)
      : scene.pickPosition(center);
    if (!hit) return null;
    return Cesium.Cartographic.fromCartesian(hit);
  }

  #describeCamera() {
    const cs = this.getCameraState();
    if (!cs?.center) return "Globe ready";
    const alt = cs.camera.altitudeMeters;
    const altText = alt >= 1000 ? `${(alt / 1000).toFixed(1)} km` : `${alt} m`;
    return `${cs.center.latitude.toFixed(4)}°, ${cs.center.longitude.toFixed(4)}°  ·  ${altText}  ·  ${cs.camera.headingDeg}°`;
  }

  #setStatus(text) {
    if (this.#statusEl) this.#statusEl.textContent = text;
  }
}
