# Geoxis

A live map of everything a company has moving in the real world, on a 3D globe.

App lives in `spatial-dashboard/`. The globe polls `GET /api/assets` — company fleet positions from the server clock, plus live ADS-B over Rotterdam from OpenSky when that network answers.

```bash
cd spatial-dashboard
npm install
npm run dev
```

No keys required for the default globe and the live feed. A Google Map Tiles key is optional (settings gear). Cixy runs on the server (`ANTHROPIC_API_KEY`).

Your own fleet: sign in, create an ingest key, and post positions to `POST /api/positions`. See [`spatial-dashboard/docs/INGEST.md`](spatial-dashboard/docs/INGEST.md).

The old "Meridian" prototype was removed in #31. The app lives in `spatial-dashboard/`.
