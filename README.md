# Geoxis

A live map of everything a company has moving in the real world, on a spinning day-and-night 3D globe.

App lives in `spatial-dashboard/`. The globe draws worldwide live aircraft (`GET /api/air`, OpenSky), live ships when AIS is connected (`GET /api/ships`), and the signed-in company's own fleet or the demo fleet (`GET /api/assets`). Click an asset for its real photo and details (`GET /api/aircraft`).

```bash
cd spatial-dashboard
npm install
npm run dev
```

No keys required for the globe and the aircraft feed. Optional: a free OpenSky account for faster refresh, an aisstream.io key for live ships. Cixy runs on the server (`ANTHROPIC_API_KEY`).

Your own fleet: sign in, create an ingest key, and post positions to `POST /api/positions`. See [`spatial-dashboard/docs/INGEST.md`](spatial-dashboard/docs/INGEST.md).

The old "Meridian" prototype was removed in #31. The app lives in `spatial-dashboard/`.
