# Geoxis — live 3D operations globe

Vanilla JS + Vite + Cesium. Redesigned 2026-10-17: a spinning day-and-night Earth over an animated
universe, worldwide live aircraft, live ships when AIS is connected, your own fleet when signed in, and
an asset card with the real photo and details of whatever you click.

```bash
npm install
npm run dev      # http://localhost:5173, every api/ route served by Vite too
npm test
npm run build
```

Pages: `/` (overview + globe), `/?view=globe` (globe only), `/fleet`, `/track`, `/pricing`, `/companies`,
`/feed`, `/login`, `/support`, `/admin`, `/terms`, `/privacy`.

Live feeds (all keyless unless noted): OpenSky ADS-B (`/api/air`, a free account makes it refresh every
90 s instead of 15 min), adsbdb + Planespotters for aircraft identity and photos (`/api/aircraft`),
aisstream.io for ships (`/api/ships`, needs `AISSTREAM_API_KEY`), Wikimedia Commons for ship photos,
NASA GIBS Black Marble for night lights, RainViewer for radar. Local work without network:
`GEOXIS_FAKE_AIR=1 npm run dev` draws synthetic traffic.

Your own fleet: sign in, create an ingest key on `/fleet`, post to `POST /api/positions`
(see `docs/INGEST.md`). Cixy runs on the server (`ANTHROPIC_API_KEY`). Every env name: `.env.example`.
