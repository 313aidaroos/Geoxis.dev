# Geoxis immersive live globe — implementation contract

## Existing stack
Vite + Cesium in `spatial-dashboard/`. Preserve existing auth, `GET /api/assets`, `POST /api/positions`, server-side Cixy, and current asset ingestion.

## Acceptance criteria
1. Main dashboard uses Geoxis's existing brand/logo, navy/cyan glass UI, accessible navigation, and a smoothly rotating Cesium Earth. Rotation pauses while dragging or inspecting an asset; resume control provided. No forced animation for reduced-motion users.
2. Clicking empty globe or “Explore Live Globe” expands into a true full-viewport immersive globe; Escape, close button and browser back restore dashboard. Zoom, pan, tilt, search and keyboard controls work on mobile and desktop.
3. Render clickable live aircraft, ships, trucks and facilities with distinct icons, clustered at low zoom. Selecting an asset opens a details panel with ID, type, source, last updated, position, speed, heading, status and track when available. Camera follows selected asset optionally.
4. Poll existing `GET /api/assets` with cleanup, error handling, timestamps and interpolation between genuine position samples. Never manufacture live positions. Explicitly mark sample/demo, stale and unavailable feeds.
5. Filter by asset type, source and status; search by ID/name. Routes and trails reflect actual ingested history; no fabricated origin/destination.
6. Live feed adapters: preserve existing OpenSky ADS-B and user-authorized fleet ingest; integrate AIS vessels only after a licensed provider/key is configured. Document credentials and rate limits; keep keys server-side.
7. Performance: throttle rendering, handle WebGL failures, responsive side panels, and sensible marker caps; no leaking timers/listeners after exiting fullscreen.
8. Tests: globe open/close, rotation pause/resume, selection, filters, stale state, empty/error feed, live/demo labels, and build pass.

## Delivery
Implement in the existing Vite/Cesium app. Avoid replacing working data infrastructure. Submit PR against main; do not merge or deploy without review.

## Asset identity and 3D presentation
- Aircraft detail: flight number, callsign, ICAO24/registration (when provided), operator, type/model, altitude, ground speed, heading, departure/arrival when verifiably supplied, position and source timestamp.
- Vessel detail: vessel name, IMO, MMSI, flag, type, course, speed, reported destination, AIS timestamp. Do not infer identities from coordinates.
- Truck detail: fleet/operator, vehicle ID, authorized plate/registration, model, location, speed, heading, shipment status and ETA only when supplied by the fleet provider. Respect tenant boundaries and privacy permissions.
- Use correctly scaled or symbolic 3D aircraft/ship/truck models in Cesium; animate transitions only between timestamped observations. Mark interpolated visuals as interpolated, not new telemetry.
- Click asset marker/model to focus camera, highlight actual trail and open expandable identity panel. Provide follow/unfollow, close and copy-ID controls; avoid confusing a globe click with an asset selection.
- All identifiers and status fields must have explicit unavailable/unknown fallback. Demo labels remain visible for synthetic assets.
